<div align="center">
  <img src="public/icons/app.svg" alt="Glyphy app icon" width="72" height="72">

  <h1>Glyphy</h1>

  <p><strong>Make your word!</strong></p>
  <p>A personal writing system, shaped by you.</p>

  <p>Create the language your thoughts have been missing.<br>
  Give your ideas, feelings, and memories a form that feels like your own.</p>

  <p>
    <a href="#a-language-of-your-own">Philosophy</a> ·
    <a href="#what-you-can-create">Features</a> ·
    <a href="#your-data-stays-with-you">Local storage</a> ·
    <a href="#looking-ahead">Roadmap</a> ·
    <a href="#running-glyphy">Get started</a>
  </p>
</div>

---

## A language of your own

Some thoughts arrive as images. Some feelings are easier to recognize than to name. A memory might live in a shape, a place, or a small detail only you understand.

Glyphy gives you a space to build a symbolic writing system around those experiences. Create a symbol, give it meaning, and let that meaning grow through the way you use it. Your vocabulary can hold concrete things, fleeting states, private associations, or ideas still taking shape.

A symbol can become a word. A group of symbols can become a thought. A collection of thoughts can become a record of your life.

## What you can create

| | A space for | What is available today |
| :---: | :--- | :--- |
| ◯ | **Your symbol dictionary** | Create and edit cards with images, meanings, synonyms, and tags. Organize meanings into categories and find cards with local search. |
| ◈ | **Your glyphs** | Combine symbols in a structured 3×3 grid. Choose readings, add a meaning and description, and link multiple glyphs into a larger expression. |
| ✦ | **Your visual diary** | Keep dated entries with a title, description, and one or more photos. Browse chronologically and search by title, description, or date. |
| ▤ | **Your diary groups** | Gather entries into named groups, choose covers, and arrange their order. Removing a group preserves its entries and photos. |
| ↗ | **Your backups** | Export a ZIP archive containing the dictionary and, when present, glyphs, diary entries, groups, and their images. Restore it on another device. |

### From a symbol to a memory

1. **Collect a sign.** Add an image and describe what it means to you.
2. **Build an expression.** Place symbols in a glyph and choose the readings that fit your thought.
3. **Keep the moment.** Create a visual diary entry with photos, words, and a date.
4. **Carry it forward.** Export a backup whenever you want to preserve or move your collection.

The dictionary, glyphs, and diary each have their own search, so you can explore one part of your collection at a time.

## Your data stays with you

Glyphy is designed for local use. Your dictionary, glyphs, diary, and images are stored on your device. Everyday use does not require an account or a remote data server.

- **Android:** the application bundles its interface for use on the phone.
- **Browser:** collections are stored in IndexedDB. The production web app supports installation as a PWA and offline use after its resources have been cached.
- **Images:** originals are retained alongside separate thumbnails.
- **Transfer:** moving a collection between devices is a deliberate ZIP export and import.

Browser storage belongs to the current site address and browser profile. Export a backup before clearing application data, changing browsers, or moving devices.

### Back up, restore, keep creating

Open **Settings** and export your collection as a ZIP file. To restore it, select the archive through the import action and choose a mode.

| Import mode | What happens |
| :--- | :--- |
| **Merge** | Adds new records while keeping existing records with matching IDs. Reimporting the same archive avoids duplicates. |
| **Replace** | Replaces the data covered by the archive after explicit confirmation. The interface offers a backup before replacement. |

Archives are validated before import. Older dictionary-only archives remain supported, while archives containing the newer modules can also carry glyphs and diary data. Keep backup files somewhere you can access independently of the app.

---

## Looking ahead

The following ideas are **planned** and are not currently available in the app. They describe the direction of Glyphy, with no committed release dates.

- **Symbol drawing** — create original signs directly inside Glyphy.
- **Personalization** — shape the workspace around your own preferences.
- **Document creation** — compose longer pieces using your symbolic vocabulary.
- **Interactive learning** — practice and gradually become fluent in the system you create.
- **Quizzes** — revisit symbols and strengthen your memory of their meanings.

## Built with

| Technology | Its role |
| :--- | :--- |
| **React + TypeScript** | The interface and typed application logic |
| **Vite** | Local development and production builds |
| **Capacitor** | The Android application and native file-sharing integration |
| **Dexie + IndexedDB** | Local collections, images, and database transactions |
| **Framer Motion** | Interface transitions and animations |
| **JSZip** | ZIP backup creation and restoration |
| **Service worker + Web App Manifest** | Browser installation and offline resources |
| **Vitest + Playwright** | Unit tests and browser checks across desktop and mobile layouts |

## Running Glyphy

<details>
<summary><strong>Local development and browser preview</strong></summary>

Use **Node.js 22.12 or later** and npm. From the project root, install dependencies and start development.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`.

For a production build and browser preview, run the following commands.

```sh
npm run build
npm run preview
```

Open `http://localhost:4173`. For browser offline use, wait until Settings reports that the app is ready to work offline. Installing a PWA requires HTTPS or a supported localhost environment.

Development, preview, and hosted addresses have separate browser storage. Use a ZIP backup to move a collection between them.

</details>

<details>
<summary><strong>Android builds and updates</strong></summary>

The repository includes a **Build Glyphy Android APK** workflow in GitHub Actions. After uploading reviewed source changes, start a new run from the target branch. A successful run provides the **Glyphy-Android-APK** artifact.

The workflow checks the web build and tests, prepares the Android project, and signs the APK using the configured repository secrets. Keep the existing signing key when updating an installed copy.

See the [Android build and update guide](GITHUB_ANDROID_GUIDE.md) and [installation notes](INSTALL_ANDROID.md) for setup and device instructions.

</details>

<details>
<summary><strong>Project checks</strong></summary>

Run the build, Node.js test suite, and Vitest checks from the project root.

```sh
npm run build
npm run test:all
npm test
```

Install the test browser before running the desktop and mobile browser suite.

```sh
npx playwright install chromium
npm run test:e2e -- --workers=2
```

The browser suite covers desktop and mobile viewport sizes. Device-specific behavior can also be checked on a physical Android phone.

</details>

---

<div align="center">
  <p><strong>Glyphy · Make your word!</strong></p>
  <p>A small space for a language that is entirely yours.</p>
</div>

