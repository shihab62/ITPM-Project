#!/usr/bin/env sh
cd "$(dirname "$0")"
echo 'Open http://localhost:8000  (Ctrl+C to stop)'
PHP_CLI_SERVER_WORKERS=4 php -S localhost:8000 router.php
