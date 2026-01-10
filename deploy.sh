#!/bin/bash
set -e

npm install
npm run build
git add .
git commit -m "Salary advance added"
git push
