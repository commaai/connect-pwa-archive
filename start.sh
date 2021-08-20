#!/bin/sh

file=/usr/share/nginx/html/config.js

rm $file

if [ -n "$COMMA_URL_ROOT" ]; then
  echo "window.COMMA_URL_ROOT = '${COMMA_URL_ROOT}';" >> $file
fi
if [ -n "$ATHENA_URL_ROOT" ]; then
  echo "window.ATHENA_URL_ROOT = '${ATHENA_URL_ROOT}';" >> $file
fi
if [ -n "$BILLING_URL_ROOT" ]; then
  echo "window.BILLING_URL_ROOT = '${BILLING_URL_ROOT}';" >> $file
fi
if [ -n "$VIDEO_HOST" ]; then
  echo "window.VIDEO_HOST = '${VIDEO_HOST}';" >> $file
fi
if [ -n "$SENTRY_ENV" ]; then
  echo "window.SENTRY_ENV = '${SENTRY_ENV}';" >> $file
fi

nginx -g 'daemon off;'
