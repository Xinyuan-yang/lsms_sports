const trackerTable = document.querySelector("#tracker-table");

function parseCsv(text) {
  return text.trim().split(/\r?\n/).map((row) => {
    const cells = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < row.length; index += 1) {
      const character = row[index];

      if (character === '"') {
        if (quoted && row[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else {
        cell += character;
      }
    }

    cells.push(cell);
    return cells;
  });
}

function addCell(row, tagName, value) {
  const cell = document.createElement(tagName);
  cell.textContent = value;
  row.append(cell);
}

async function renderTracker() {
  if (!trackerTable) return;

  try {
    const sources = [trackerTable.dataset.source, trackerTable.dataset.fallback];
    let rows;

    for (const source of sources) {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load tracker data");

        rows = parseCsv(await response.text());
        if (rows.length) break;
      } catch (error) {
        // Try the local snapshot when the live Sheet cannot be reached.
      }
    }

    if (!rows?.length) throw new Error("Unable to load tracker data");

    const header = document.createElement("thead");
    const headerRow = document.createElement("tr");
    rows[0].slice(0, 4).forEach((cell) => addCell(headerRow, "th", cell));
    header.append(headerRow);

    const body = document.createElement("tbody");
    rows.slice(1, 15).forEach((cells) => {
      const row = document.createElement("tr");
      cells.slice(0, 4).forEach((cell) => addCell(row, "td", cell));
      body.append(row);
    });

    trackerTable.replaceChildren(header, body);
  } catch (error) {
    trackerTable.innerHTML = "<caption>Tracker data is currently unavailable.</caption>";
  }
}

renderTracker();

function columnIndex(columnLabel) {
  return [...columnLabel.toUpperCase()].reduce(
    (index, character) => index * 26 + character.charCodeAt(0) - 64,
    0,
  ) - 1;
}

function getDistanceSource(source, sheetName) {
  const url = new URL(source, window.location.href);
  if (!url.hostname.endsWith("docs.google.com")) return source;

  if (!url.pathname.includes("/gviz/tq")) {
    const documentMatch = url.pathname.match(/\/spreadsheets\/d\/(e\/)?([^/]+)/);
    if (!documentMatch) throw new Error("Invalid Google Sheets URL");

    url.pathname = `/spreadsheets/d/${documentMatch[1] || ""}${documentMatch[2]}/gviz/tq`;
    url.search = "";
    url.hash = "";
  }

  url.searchParams.set("tqx", "out:csv");
  if (sheetName) url.searchParams.set("sheet", sheetName);
  url.searchParams.delete("gid");
  return url.toString();
}

async function renderSheetValue(valueElement) {
  const source = valueElement.dataset.source?.trim();
  const block = valueElement.dataset.block?.trim();
  const match = block?.match(/^(?:(.+)!)?([A-Z]+)([1-9]\d*)$/i);

  // Leave the fallback value in place until the source and cell are configured.
  if (!source || !match) return;

  try {
    const response = await fetch(getDistanceSource(source, match[1]), { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load distance data");

    const rows = parseCsv(await response.text());
    const value = rows[Number(match[3]) - 1]?.[columnIndex(match[2])]?.trim();
    if (!value) throw new Error("Distance cell is empty");

    valueElement.textContent = value;
  } catch (error) {
    // Retain the fallback value when the Sheet cannot be read.
  }
}

document
  .querySelectorAll("[data-source][data-block]")
  .forEach((valueElement) => renderSheetValue(valueElement));
