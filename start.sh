#!/bin/bash
export PATH=/www/server/nodejs/v20.20.2/bin:$PATH
cd /www/wwwroot/oa.qyfanshen.com
exec node node_modules/next/dist/bin/next start -p 3000
