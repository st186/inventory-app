#!/bin/bash
set -e

npm install
npm run build
git add .
git commit -m "seperate out online/offline sales, improved UI for sales data, improved data capture data"
git push
