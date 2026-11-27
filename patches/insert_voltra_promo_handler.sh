#!/bin/sh
set -eu

target="/src/internal/rpc/messages_send.go"
tmp="/tmp/messages_send.go.voltra"

awk '
BEGIN { count = 0 }
{
  print
  if ($0 ~ /^func \(r \*Router\) onMessagesSendMessage\(/) {
    count++
    print "\tif updates, handled, err := r.tryRedeemVoltraPromo(ctx, req); handled || err != nil {"
    print "\t\treturn updates, err"
    print "\t}"
  }
}
END {
  if (count != 1) {
    print "Expected exactly one onMessagesSendMessage handler, found " count > "/dev/stderr"
    exit 42
  }
}
' "$target" > "$tmp"

mv "$tmp" "$target"
