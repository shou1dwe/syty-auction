SELECT t.slot, t.bid, STRING_AGG(DISTINCT t.user_id, ',') AS max_user_ids
FROM biddings t
WHERE t.bid =
    (SELECT MAX(h.bid)
    FROM biddings h
    WHERE h.slot = t.slot)
AND t.Slot = ${slot}
GROUP BY t.Slot, t.Bid