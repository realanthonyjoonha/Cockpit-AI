---
description: Verify house vs pack WATCH alignment for a desk
argument-hint: "[desk e.g. slug|ticker]"
---

Desk = `$ARGUMENTS` if non-empty, else ask once for a desk from list_desks.

## Steps

1. `get_house_view`  
2. `get_pack_snapshot`  

## Output

1. House stance / status / date  
2. Pack WATCH list (exact names)  
3. Whether house prose maps to those WATCHes (yes/no + one sentence)  
4. Decision-support only. **No edits.**

**Efficiency:** Do not mine chat history. Two tools only: get_house_view + get_pack_snapshot.

