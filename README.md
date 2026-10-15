# ⚡ TabDeck

**A beautiful, private new tab page for Chrome.**
Every time you open a new tab, TabDeck shows your own dashboard: workspaces, bookmarks, quick links, notes, tasks, a focus timer and the weather.

> Built with ❤️ by [Shihab Hossain](https://www.linkedin.com/in/sheikh-shihab-hossain/) & [Ahsan Jannat](https://www.linkedin.com/in/ahsan-jannat/)

Version **2.2.0** · Chrome 104 or newer · MIT licence

---

## What's inside

| | |
|---|---|
| **Workspaces** | Separate spaces (Home, Work, Study…) that each keep their own bookmarks, folders, notes, tasks and Quick Access links. |
| **Bookmarks & folders** | Folders with one level of subfolders. Drag to reorder, drop a bookmark onto a folder, move a bookmark or whole folder to another workspace. |
| **Quick Access** | Up to 8 big tiles per workspace for the sites you open all day. |
| **Notes** | A note editor that saves itself, with tags, pinning and search. |
| **Tasks** | Add a task and press Enter. Double-click to edit. Finished tasks drop to the bottom. |
| **Focus timer** | 25, 15 or 5 minutes. The countdown shows in the tab title and keeps running if you switch tabs. You get a sound and a notification when it ends. |
| **Search & commands** | Press `/` (or `Ctrl`/`⌘` + `K`) to search bookmarks, notes and history, or to run actions like "New note" or "Switch light / dark". |
| **Trash with Undo** | Everything you delete (notes, tasks, links, bookmarks, folders, whole workspaces) goes to Trash for 30 days. Most deletes show an **Undo** button. |
| **Save from any page** | Click the TabDeck icon in the toolbar to save the page you're on to a workspace. |
| **History, Downloads, Analytics** | Handy views of your Chrome history, recent downloads and browsing habits. Analytics is calculated on your computer. |
| **12 themes** | Each with a light or dark mode where it makes sense (see below), plus your own accent colour. |
| **Backup** | Export everything as one file and import it later (Settings → Export All Data / Import Data). |

## Themes

Pick one in **Settings → Theme pack**.

| Theme | Look |
|---|---|
| Default | Dark glass, purple accent, soft |
| Mono | Minimal, lots of whitespace, sage accent |
| Brutal | Sharp, mustard and black, bold |
| Atelier | Editorial, ivory and oxblood, serif |
| Holodeck | Sci-fi HUD, cyan grid, scanlines |
| Aurora | Northern lights, green glow, glass |
| Ember | Warm dark, amber fire, cosy |
| Sakura | Cherry blossom, soft pink |
| Obsidian | Black glass, glossy sheen |
| Aura | Iridescent violet, rose and sky |
| Jannat Design | Space navy, purple pill, cover-art cards (dark only) |
| Jannat Design V2 | Light lavender, glassmorphism (light only) |

## Install

TabDeck isn't on the Chrome Web Store, so you add it by hand. It takes a minute.

1. Download this project and unzip it. You should end up with a folder that contains `manifest.json`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the folder from step 1 (the one that has `manifest.json` directly inside it).
5. Open a new tab. A short welcome asks your name and whether to start with example bookmarks.

To pin the toolbar icon, click the puzzle-piece button in Chrome and pin **TabDeck**.

> Updating: replace the files in the same folder, then click the ↻ button on the TabDeck card in `chrome://extensions`. Your data stays.

## Using it

**Workspaces.** Switch with the tabs under the clock or from the sidebar. **+ New** adds one; **Manage** renames, reorders or deletes them. A deleted workspace goes to Trash with everything in it.

**Bookmarks.** On Home, each folder is a card. Click a card to open it. Use **⋯** on a card or bookmark to rename, move to another folder or workspace, or delete. The **Bookmarks** page has two tabs: *Workspace bookmarks* (the ones you keep in TabDeck) and *Chrome bookmarks* (your browser's own, which you can also edit). **Settings → Import Chrome Bookmarks** copies your Chrome bookmarks into a new workspace. Chrome's own bookmarks are edited in Chrome itself, so deleting one there asks first and can't be undone.

**Quick Access.** Click **Add** (or the + tile). Use **⋯** on a tile to edit or remove it, or drag tiles to reorder them.

**Notes.** Click **+** on the Notes card. Notes save as you type and again when you close the editor. **Delete** moves a note to Trash; **Discard** (on a brand-new note) throws it away.

**Tasks.** Type in the box at the top of the Tasks card and press Enter. Click the circle to finish a task, double-click the text to edit it, and use the tick button to clear finished tasks.

**Weather.** Click the weather card to type a city, or to use your device's location (Chrome asks for permission only when you do this). Temperature can be °C or °F in Settings.

**Keyboard shortcuts.** `/` or `Ctrl`/`⌘` + `K` opens search. `↑` `↓` `Enter` choose a result. `Esc` closes things. `?` shows the list.

## Your data and privacy

- Everything you create (workspaces, bookmarks, notes, tasks, settings) is stored **only in Chrome on this computer**. There are no accounts, no sign-in and no sync.
- TabDeck contains **no analytics or tracking**.
- Backups are files **you** download and keep. Use **Settings → Export All Data** and **Import Data** to move to another computer.

The only things that touch the internet:

| What | Where it goes | When |
|---|---|---|
| Weather | `wttr.in`. By default it works out your rough location from your IP address. If you choose a city it sends the city name. If you choose "device location" it sends coordinates rounded to about 1 km. The answer is kept for 30 minutes. | When the weather card is on |
| Site icons | **Sharper** (default): Google's icon service (`t3.gstatic.com`) is asked for each site's logo, so Google learns which sites you save. **Private**: only icons Chrome already has; nothing is sent. | When bookmarks and Quick Access links are shown. Change it in **Settings → Privacy → Site icons** |
| Wallpaper photos | `picsum.photos` | Only if you turn on the wallpaper in Settings (off by default) |

Fonts are bundled inside the extension, quotes are built in, and nothing else is requested.

### Why TabDeck asks for these permissions

| Permission | Used for |
|---|---|
| `storage` | Keeping your data in Chrome |
| `bookmarks` | The Chrome bookmarks tab, import, and search |
| `history` | The History page, Analytics and search results |
| `downloads` | The Downloads page |
| `topSites` | Analytics (most visited sites) |
| `favicon` | Showing site icons from Chrome's own cache |
| `activeTab` | Reading the title and address of the page you save with the toolbar button |
| `alarms`, `notifications` | The "focus session finished" notification when the new-tab page isn't showing |
| `https://wttr.in/*` | The weather card |
| *Optional:* `geolocation` | Only if you press "use my device's location" for weather. Chrome asks at that moment |

## Questions

**Where is my data?** In Chrome's local storage for this extension. Removing the extension removes the data, so download a backup first if you might need it.

**How do I get my data onto another computer?** Settings → Export All Data, then on the other computer Settings → Import Data. You'll be asked to confirm and can Undo straight after.

**I deleted something by accident.** Click **Undo** on the message that appears, or open **Trash** and press **Restore**. Items stay for 30 days.

**Can I use my own wallpaper?** Not yet. You can turn on rotating photos in Settings.

**The toolbar button says a page can't be saved.** Chrome's own pages (`chrome://…`, the Web Store) can't be saved from the popup. Open a normal website.

**A theme looks wrong after an update.** Click ↻ on the extension in `chrome://extensions`, then open a fresh tab.

## What changed in 2.2.0

- **Safer saving.** Open tabs and the toolbar popup no longer overwrite each other's changes; they merge, and update live.
- **Trash covers everything**, and most deletes have an Undo button. Deleted workspaces keep all their contents. Deleted example workspaces no longer come back.
- **Notes can't be lost.** The editor saves while you type and when it closes.
- **Moving bookmarks and folders between workspaces works** (they used to disappear).
- **Import is checked.** It validates the file, asks before replacing anything, and has Undo.
- **Search can run commands**, searches history, and opens notes from any workspace.
- **Tasks:** quick-add box, all tasks visible, edit in place, clear finished.
- **Focus timer** keeps accurate time in background tabs, remembers its state, shows in the tab title and notifies you.
- **Weather** is cached, supports °F, and no longer needs your location at install time.
- **Privacy:** the Google sign-in (which never worked) and the unused sync are gone. Fewer permissions. Fonts and quotes are bundled. Site icons can be set to private.
- **Toolbar popup** now follows your theme, remembers your last workspace, respects the 8-tile limit and avoids duplicates.
- **Bookmarks page** has an explicit Workspace / Chrome switch; sort and filter no longer jump between the two.
- **Accessibility:** keyboard access everywhere, visible focus, screen-reader names, reduced-motion support, larger small text.
- Many smaller fixes (see the commit history or `dev/tests/run.js` for what is covered).

## For developers

```
manifest.json         Chrome extension manifest (Manifest V3)
newtab.html           The new-tab page            popup.html   The toolbar popup
background.js         Timer notifications         fonts/       Bundled fonts
js/core/              Storage and saving (storage.js), small helpers
js/widgets/           Clock + weather, quote + focus timer
js/features/          Bookmarks, history, Quick Access, notes + tasks, Trash, search palette
js/ui/                Workspaces, settings + themes, navigation + dialogs, event wiring
js/main.js            Start-up (runs last)        js/a11y.js   Accessibility helpers
js/popup.js           Popup logic                 js/fouc.js   Applies the theme before first paint
js/quotes.js          Built-in quotes
css/themes/           default.css (base) + 11 theme files
css/polish.css        Shared polish layer         css/popup*.css   Popup styles
dev/                  Optional tests (not loaded by Chrome)
```

- **Storage model.** All state lives in `chrome.storage.local` under seven keys (`user`, `workspaces`, `activeWsId`, `trash`, `settings`, `weatherLocation`, `wsData`). Saves are a three-way merge (`mergeValue` in `js/core/storage.js`) guarded by a Web Lock, so several tabs and the popup can write safely.
- **Stylesheet order.** A theme's file is placed *in front of* `css/themes/default.css`, which always loads (the themes were tuned against that order, so it is intentional).
- **Tests.** `cd dev && npm install && npm test` runs the new-tab page in a simulated browser and checks the behaviour listed above.
- **Publishing.** If you ever zip this for the Web Store, leave out the `dev/` folder.

## Licence

MIT. See [LICENSE](LICENSE).
