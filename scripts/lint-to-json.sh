#!/usr/bin/env bash
# lint-to-json.sh
# Runs the project lint pipeline and outputs results as JSON to stdout (or a file).
#
# Usage:
#   ./scripts/lint-to-json.sh            # prints JSON to stdout
#   ./scripts/lint-to-json.sh out.json   # writes JSON to out.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

OUTPUT_FILE="${1:-}"

# Temp directory for intermediate JSON files
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

OXLINT_JSON="${WORK_DIR}/oxlint.json"
TSC_JSON="${WORK_DIR}/tsc.json"
JSCPD_JSON="${WORK_DIR}/jscpd.json"
EXITS_JSON="${WORK_DIR}/exits.json"

# ──────────────────────────────────────────────
# 1. oxlint with JSON format
# ──────────────────────────────────────────────
oxlint_exit=0
./node_modules/.bin/oxlint \
  --config oxlint.config.js \
  --format json \
  ./src > "${OXLINT_JSON}" 2>&1 || oxlint_exit=$?

# If output is not valid JSON, write empty result
if ! python3 -c "import json; json.load(open('${OXLINT_JSON}'))" 2>/dev/null; then
  echo '{"diagnostics":[]}' > "${OXLINT_JSON}"
fi

# ──────────────────────────────────────────────
# 2. TypeScript type-check
# ──────────────────────────────────────────────
tsc_exit=0
tsc_raw=$(./node_modules/.bin/tsc --noEmit 2>&1) || tsc_exit=$?

# Parse tsc text output into structured records:
#   file(line,col): error TS1234: message
echo "${tsc_raw}" | python3 - "${TSC_JSON}" <<'PYEOF'
import sys, json, re

out_path = sys.argv[1]
pattern = re.compile(
    r'^(?P<file>.+?)\((?P<line>\d+),(?P<col>\d+)\):\s+'
    r'(?P<severity>error|warning|message)\s+TS(?P<code>\d+):\s+(?P<message>.+)$'
)

diagnostics = []
for raw_line in sys.stdin:
    line = raw_line.rstrip()
    m = pattern.match(line)
    if m:
        diagnostics.append({
            "file":     m.group("file"),
            "line":     int(m.group("line")),
            "column":   int(m.group("col")),
            "severity": m.group("severity"),
            "code":     "TS" + m.group("code"),
            "message":  m.group("message"),
        })

with open(out_path, "w") as f:
    json.dump(diagnostics, f)
PYEOF

# ──────────────────────────────────────────────
# 3. jscpd duplicate detection
# ──────────────────────────────────────────────
jscpd_exit=0
./node_modules/.bin/jscpd ./src \
  --reporters json \
  --output "${WORK_DIR}" \
  --silent 2>&1 || jscpd_exit=$?

if [[ ! -f "${WORK_DIR}/jscpd-report.json" ]]; then
  echo '{}' > "${JSCPD_JSON}"
else
  cp "${WORK_DIR}/jscpd-report.json" "${JSCPD_JSON}"
fi

# ──────────────────────────────────────────────
# 4. Write exit codes to temp file
# ──────────────────────────────────────────────
cat > "${EXITS_JSON}" <<EOF
{"oxlint": ${oxlint_exit}, "tsc": ${tsc_exit}, "jscpd": ${jscpd_exit}}
EOF

# ──────────────────────────────────────────────
# 5. Combine into unified JSON schema
# ──────────────────────────────────────────────
combined=$(python3 - "${OXLINT_JSON}" "${TSC_JSON}" "${JSCPD_JSON}" "${EXITS_JSON}" <<'PYEOF'
import json, sys
from datetime import datetime, timezone

oxlint_path, tsc_path, jscpd_path, exits_path = sys.argv[1:]

with open(oxlint_path)  as f: oxlint = json.load(f)
with open(tsc_path)     as f: tsc    = json.load(f)
with open(jscpd_path)   as f: jscpd  = json.load(f)
with open(exits_path)   as f: exits  = json.load(f)

lint_diags = oxlint.get("diagnostics", [])
passed = all(v == 0 for v in exits.values())

result = {
    "schemaVersion": "1.0.0",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "summary": {
        "passed": passed,
        "exitCodes": exits,
    },
    "lint": {
        "tool":        "oxlint",
        "exitCode":    exits["oxlint"],
        "diagnostics": lint_diags,
        "count":       len(lint_diags),
        "meta": {k: v for k, v in oxlint.items() if k != "diagnostics"},
    },
    "typecheck": {
        "tool":        "tsc",
        "exitCode":    exits["tsc"],
        "diagnostics": tsc,
        "count":       len(tsc),
    },
    "duplicates": {
        "tool":     "jscpd",
        "exitCode": exits["jscpd"],
        "report":   jscpd,
    },
}

print(json.dumps(result, indent=2))
PYEOF
)

if [[ -n "${OUTPUT_FILE}" ]]; then
  echo "${combined}" > "${OUTPUT_FILE}"
  echo "Results written to ${OUTPUT_FILE}" >&2
else
  echo "${combined}"
fi

# Exit non-zero if any tool failed
overall_exit=$(( oxlint_exit | tsc_exit | jscpd_exit ))
exit ${overall_exit}
