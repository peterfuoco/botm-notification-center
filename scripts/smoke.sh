#!/usr/bin/env bash
# Manual smoke test against the dev server. Run after: npm run db:reset && npm run dev
BASE=localhost:3000
ADMIN='X-Admin-Key: local-admin-key'
JSON='Content-Type: application/json'

req() {
  local label=$1 expect=$2; shift 2
  echo "=== $label"
  echo "expect: $expect"
  curl -s -w '\n[HTTP %{http_code}]\n' "$@"
  echo
}

# Pull the first item's id out of a feed response, whatever the list key is called
first_id() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const a=Array.isArray(o)?o:(o.items||o.notifications||o.data||Object.values(o).find(Array.isArray)||[]);console.log(a[0]?a[0].id:"NONE")})'
}

echo "##### 1. Event + replay"
req "1a event enroll-1" 'deliveriesCreated 1' -X POST $BASE/events -H "$ADMIN" -H "$JSON" -d '{"eventId":"enroll-1","accountId":1,"eventType":"ENROLLED","occurredAt":"2026-10-07T12:00:00Z"}'
req "1b same event again" 'deliveriesCreated 0' -X POST $BASE/events -H "$ADMIN" -H "$JSON" -d '{"eventId":"enroll-1","accountId":1,"eventType":"ENROLLED","occurredAt":"2026-10-07T12:00:00Z"}'
req "1c feed account 1" 'one item, isClicked false' $BASE/me/notifications -H 'X-Account-Id: 1'

echo "##### 2. Filter sweep + clicks"
req "2a sweep" 'filter deliveriesCreated ~5' -X POST $BASE/admin/maintenance/run -H "$ADMIN"
req "2b sweep again" 'filter deliveriesCreated 0' -X POST $BASE/admin/maintenance/run -H "$ADMIN"
DELIVERY_ID=$(curl -s $BASE/me/notifications -H 'X-Account-Id: 2' | first_id)
echo "captured DELIVERY_ID=$DELIVERY_ID"; echo
req "2c click as owner" '204' -X POST $BASE/me/notifications/$DELIVERY_ID/click -H 'X-Account-Id: 2'
req "2d click again as owner" '204' -X POST $BASE/me/notifications/$DELIVERY_ID/click -H 'X-Account-Id: 2'
req "2e click as account 3" '404' -X POST $BASE/me/notifications/$DELIVERY_ID/click -H 'X-Account-Id: 3'
req "2f feed account 2" 'item isClicked true' $BASE/me/notifications -H 'X-Account-Id: 2'

echo "##### 3. Delayed event + deactivate"
CREATE=$(curl -s -X POST $BASE/admin/notifications -H "$ADMIN" -H "$JSON" -d '{"type":"EVENT","iconUrl":"https://cdn.example.com/s.png","headline":"Your box shipped","subheadline":"Track it","linkPath":"/orders","eventType":"SHIPPED","delayDays":5}')
echo "=== 3a create SHIPPED notification"; echo "$CREATE"; echo
NOTIF_ID=$(echo "$CREATE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(o.id ?? (o.notification&&o.notification.id) ?? "NONE")})')
echo "captured NOTIF_ID=$NOTIF_ID"; echo
req "3b activate" '200, active' -X POST $BASE/admin/notifications/$NOTIF_ID/activate -H "$ADMIN"
req "3c ship event" 'deliveriesCreated 1 (pending)' -X POST $BASE/events -H "$ADMIN" -H "$JSON" -d '{"eventId":"ship-1","accountId":2,"eventType":"SHIPPED","occurredAt":"2026-10-07T12:00:00Z"}'
req "3d feed account 2" 'NO "Your box shipped" yet' $BASE/me/notifications -H 'X-Account-Id: 2'
req "3e deactivate" 'pendingCancelled 1' -X POST $BASE/admin/notifications/$NOTIF_ID/deactivate -H "$ADMIN"

echo "##### 4. CSV upload"
req "4a upload csv" 'submitted 3, inserted 2, skipped 1, duplicateCount 1, invalidLines [abc]' -X POST $BASE/admin/notifications/4/recipients -H "$ADMIN" -H 'Content-Type: text/csv' --data-binary $'account_id\n1\n2\n2\n999\nabc\n'
req "4b re-upload" 'inserted 0' -X POST $BASE/admin/notifications/4/recipients -H "$ADMIN" -H 'Content-Type: text/csv' --data-binary $'account_id\n1\n2\n'

echo "##### 5. Remove from app"
req "5a feed account 2 before remove" 'filter notification present' $BASE/me/notifications -H 'X-Account-Id: 2'
req "5b remove notification 3" '200' -X POST $BASE/admin/notifications/3/remove -H "$ADMIN"
req "5c feed account 2 after remove" 'filter notification GONE' $BASE/me/notifications -H 'X-Account-Id: 2'
req "5d activate removed" '409' -X POST $BASE/admin/notifications/3/activate -H "$ADMIN"

echo "##### 6. Errors"
req "6a no admin key" '401' $BASE/admin/notifications
req "6b activate CSV" '409' -X POST $BASE/admin/notifications/4/activate -H "$ADMIN"
req "6c filter field on EVENT" '400' -X PATCH $BASE/admin/notifications/1 -H "$ADMIN" -H "$JSON" -d '{"countries":["US"]}'
req "6d malformed JSON" '400 Malformed JSON body' -X POST $BASE/events -H "$ADMIN" -H "$JSON" -d '{bad json'
req "6e unknown account" '404' -X POST $BASE/events -H "$ADMIN" -H "$JSON" -d '{"eventId":"x","accountId":424242,"eventType":"ENROLLED","occurredAt":"2026-10-07T12:00:00Z"}'
