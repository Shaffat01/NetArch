# NetAtlas local / LAN run

LibreNMS `192.168.102.18:8000` is a private/local address. The hosted preview cannot reach it. Run NetAtlas on a computer that can open the LibreNMS URL.

## Requirements

- Node.js 20 or newer (includes npm)
- A browser
- Network access from this computer to LibreNMS

No runtime `npm install` is required. Python/openpyxl and the dev dependencies are only needed for workbook regeneration/tests.

## Windows

1. Extract this ZIP into a private folder.
2. Run `start-netatlas.bat`.
3. Open `http://localhost:3000` if the browser does not open automatically.
4. Open **Live operations → Sync now**.

The default **Architecture → Unified IP map** merges all three sources into canonical IP-led devices and connections. Click a device for its best name, primary IP, aliases, connected canonical devices, conflicts, and incomplete evidence. External/WAN/Core/Fabric/Distribution are shown first; enable Access, Services, Management, or Other from the layer buttons. Use **Register topology** for the previous editable WMTC/WHIL register view.

The workspace also includes **Port connectivity** (431 source port/cabling rows, safe Access inventory, and cable labels) and **IPAM & peering** (90 IP allocations, 98 VLAN rows, device/ISP peering, and loopbacks). These views work offline and do not need LibreNMS. **DC / NDC → Core links** uses the same canonical IP resolver: 188 raw rows, 181 resolved rows, 82 canonical devices, and 158 canonical connections; seven blank targets remain preserved. The previous topology remains under **Main register**. Credential worksheets and HQ Access usernames are not included in the app snapshot.

### Editing the local workspace

- **Unified IP map → Add device / Add connection** edits the canonical architecture directly. Click a node or link for **Edit** and **Delete**. Changes are local overrides/tombstones, not Google Sheets writes.
- **DC / NDC**, **DMZ / MZ**, **Port connectivity**, and **IPAM & peering** each have an **Add** button. Every row has edit/delete action icons, and detail drawers have the same controls. **DC / NDC → Raw source rows** also exposes deliberately hidden source rows for explicit CRUD without changing the default rack exclusions.
- All requested collections are editable: DataCenter and DMZ/MZ entries, port rows, HQ Access inventory, cable labels, IP blocks, VLANs, device peers, ISP peers, loopbacks, and the existing main-register devices.
- Saves go to `data/user-state.json` when the local server is running, with browser localStorage as a fallback. Unified/Core views, counts, search, and exports refresh after each save.
- **Source records → Reset edits** restores the source snapshot and clears local unified overrides. The six requested DC display exclusions remain display-only; they do not delete raw source rows.

## Linux / macOS

```bash
chmod +x start-netatlas.sh
./start-netatlas.sh
```

Or run manually:

```bash
npm start
```

Then open `http://localhost:3000`.

## LibreNMS configuration

The included `.env` already contains the LibreNMS URL/token you supplied and:

```dotenv
LIVE_REFRESH_SECONDS=60
AUTO_DISCOVER=true
```

Zabbix remains disabled; leave its settings blank. Keep this ZIP and `.env` private because they contain an API token.

After changing `.env`, stop the server with Ctrl+C and run `npm start` again.

## Allow another LAN computer to use NetAtlas

The server listens on `0.0.0.0:3000`. Allow TCP port 3000 in the local firewall, then open:

```text
http://NETATLAS-COMPUTER-IP:3000
```

The browser and NetAtlas server do not need internet access, but the NetAtlas server must reach LibreNMS.

## Troubleshooting

- Open `http://192.168.102.18:8000/` on the NetAtlas computer first. If it does not open there, NetAtlas cannot sync either.
- If Windows CMD reports `listen EACCES: permission denied 0.0.0.0:3000`, use another local port instead of changing Node versions:

  ```bat
  set PORT=8000&& npm start
  ```

  Then open `http://localhost:8000`. If needed, try `set PORT=18080&& npm start` and open `http://localhost:18080`.
- **Live operations** shows connection/API warnings; it does not invent live data.
- For each new LibreNMS IPv4 device, the **third octet is treated as its VLAN**. A unique Distribution with the same third octet receives it as **Access** under that Distribution. Unmatched or ambiguous devices remain in **Discovered**. Existing hostname/IP matches are not duplicated.
- Example: `192.168.135.44` → VLAN/third octet `135` → `WMTC Building-4` (`192.168.135.1`). A VLAN-only assignment is drawn as a dashed link and is not presented as workbook port evidence.
- Manual GUI edits are saved in `data/user-state.json` on the local computer.
- **Source records → Reset edits** restores the workbook snapshot and removes local edits.
