# Airfield DSML: Hangar Bay Modeling Language

This project provides a Domain-Specific Modeling Language (DSML) for hangar bay modeling, addressing the complex geometric and combinatorial challenges of aircraft induction on busy airfields. The tooling includes a VS Code extension, a Command-Line Interface (CLI), and a full-stack Web Application.

---

## Prerequisites

Before setting up the project, ensure the following software is installed on your host machine:

* **Node.js**: Version `20.10.0` or later (Recommended: `20.19.2` via Volta).
* **npm**: Version `10.2.3` or later (Recommended: `10.8.2` via Volta).
* **Git**: For repository management.
* **Visual Studio Code**: Required specifically for the extension development environment.

**Supported OS**: macOS 14, Ubuntu 22.04, and Windows 11 (via WSL 2).

---

## Getting Started

### 1. Clone the Repository
Clone the project and navigate to the root directory (the root of the npm workspace):
```bash
git clone [https://github.com/rSamaei/hangar-bay-model-dsml.git](https://github.com/rSamaei/hangar-bay-model-dsml.git)
cd hangar-bay-model-dsml
```
*If using a ZIP submission, extract the contents and set your working directory to the project root.*

### 2. Install Dependencies
Install dependencies for all workspace packages (`language`, `simulator`, `cli`, `extension`, and `web`) in one command:
```bash
npm install
```

### 3. Generate Langium Artifacts
The grammar must be compiled into the parser and AST code before the initial build:
```bash
npm run langium:generate
```

### 4. Build the Project
Compile TypeScript across every workspace package in the correct dependency order:
```bash
npm run build
```
Compiled output is located in the `out/` directory of each package.

---

## Verification & Testing

To confirm the build is correct and all components are functioning, run the full test suite (Vitest):
```bash
npm test
```
*Expected: 1,092 tests with zero failures.*

To view the code coverage report:
```bash
npm run test:coverage
```

---

## Tooling Usage

### VS Code Extension
The extension provides a rich editing experience for `.air` files.

1.  Open the root folder in VS Code.
2.  Press **F5** (or **Run → Start Debugging**) to launch the **Extension Development Host**.
3.  In the new window, open or create a `.air` file.
4.  **Features included**:
    * Syntax highlighting.
    * Real-time validation diagnostics (Problems panel).
    * Autocompletion for keywords and identifiers.
    * **Quick-fixes**: Automatically fix contiguity issues or expand bay assignments to satisfy wingspan requirements.

### Command-Line Interface (CLI)
The CLI parses `.air` files, validates constraints, and generates JSON reports.

**Basic Usage:**
```bash
node packages/cli/bin/cli.js generate <path-to-file.air>
```

**Example:**
```bash
node packages/cli/bin/cli.js generate airfield-tests/examples/01-raf-valley-base.air
```

**Options:**
* `-d <directory>`: Specify a custom output directory (defaults to `generated/`).

**Note**: The CLI will exit with a non-zero code if "Severity-1" errors are found. Warnings and hints (like corridor-fit advisories) will appear in the JSON output but will not halt the pipeline.

### Web Application
The web app features a Monaco-based code editor and an analysis interface powered by a React frontend and Express backend.

1.  Navigate to the web package:
    ```bash
    cd packages/web
    ```
2.  Start the production build:
    ```bash
    npm start
    ```
3.  Access the application at `http://localhost:3000`.

---

## Project Structure

* `packages/language`: Core DSL grammar and Langium definition.
* `packages/simulator`: Analysis and auto-scheduling engine.
* `packages/cli`: Command-line tool for automated reporting.
* `packages/extension`: VS Code integration code.
* `packages/web`: Browser-based editor and API.
* `airfield-tests/examples/`: Sample `.air` files for testing features.
