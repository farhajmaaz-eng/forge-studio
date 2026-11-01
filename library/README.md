# Forge reference library

This source pack contains 31 official Roblox Creator Documentation guides with offline article text, source URLs, pinned Git revision, retrieval timestamp and SHA-256 source digest. Roblox Creator Documentation contributors own the source material, distributed under **Creative Commons Attribution 4.0 International**; see ROBLOX-LICENSE.txt and https://creativecommons.org/licenses/by/4.0/ . Each article carries attribution and a link to its exact upstream revision. Front matter is omitted from the reader copy. Unsupported documentation components are not executed by the Markdown reader.

Forge's summaries, practical do/don’t notes in catalog.json and the three SVG explanatory diagrams are original editorial material. They are guidance, not official Roblox policy or guarantees. Check live documentation for current policies, limits and evolving APIs. External illustrations embedded by a source may require internet access; the three Forge diagrams are bundled for offline use.

Refresh the pack with Python 3 (no additional Python dependencies):

    python scripts/scrape-library.py

The scraper retrieves a single upstream commit, downloads the catalog pages from that commit, and replaces official.json only after every download succeeds. Restart the worker to update the SQLite index. Existing bookmarks and personal references are preserved. A failed scrape leaves the previous pack intact.

Personal references are created, edited, bookmarked and deleted on the Library page; their text, links and optional small image uploads live in local SQLite. They are not committed to GitHub. A source URL is saved as a reference, not automatically fetched. You may import your own Markdown or plain text files up to 60 KB and images up to 30 KB, or use an HTTPS image URL.

All seven agents receive library_search and library_read. Search uses SQLite FTS5 with title weighting; full reads are paginated in 12,000-character sections so the entire collection is not pushed into every model request. Model calls that use these tools still count against your configured spending cap. Tool activity is recorded in the ordinary task ledger. Agents are instructed to treat retrieved content as reference data and cite reference IDs. Access to a guide does not replace real Studio verification.
