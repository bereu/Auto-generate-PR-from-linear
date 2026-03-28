---
name: run-regression-testing
description: this skill for regression testing, To check main user story is working or not.
version: 1.1.0
---

# Test case

## Positive
1. create linear issues with agent label
2. agent will run 
3. create fix PR

## Negative
1. create linear issues with agent label
2. some error will happen
3. issues status will be `Suspend`

## CLI
**preconditions**
linear and GitHub tokens are already configured. 

**command**
run local: `npm run dev:local`
linear: `linear-cli -h`
github: `gh -h`


