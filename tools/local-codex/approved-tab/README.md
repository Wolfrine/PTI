# PTI Owner Chrome

An ordinary ChatGPT chat starts a Local Codex task through the existing private connector. In that task, `pti_owner_tab.request_page` requests an observation from Chrome on the PC. The owner reviews the title, visible headings and optional exact link in the extension popup. Only pressing Share releases the preview to that task. The native thread reads the receipt with `pti_owner_tab.read_result` and returns the observed result through `get_task`.

The extension uses Chrome's activeTab, scripting and Native Messaging permissions. It has no debugger or persistent website permissions. The reviewed origins in `scope.mjs` cover the existing local preview and Taleweald site, plus Example Domain and IANA for the public link flow. Query strings, credential URLs and other origins are out of scope. A site or action denial is binding. Data from the page is untrusted.

The Windows installer validates its inputs against published main and registers this component only for new Local Codex worker processes. Run the installer with a published revision. Load the reported extension directory through Chrome's **Load unpacked** control in the intended profile. Chrome may require the owner to enable developer mode for an unpacked installation. If policy disallows installation, use the existing approved distribution process. Do not override policy. Keep the older disabled provider separate. Chrome retains control of grants, revocation and the tab.

When a request arrives, open the PTI Owner Chrome popup, select the request and use **Open requested page** if needed. On the requested tab, review the preview and press **Share with ChatGPT** or **Share and open link**. When following a link, open the popup on the destination and share that preview to confirm the page actually loaded. A declined request stays declined. An incomplete request can be retrieved from the same native thread with its receipt ID.

Source stays in the PTI repository on F:. The per-user native launcher, compiled MCP, extension release and private receipts reside under `H:\LocalCodexBridge\approved-tab`. The existing private relay handles the return to the calling chat.
