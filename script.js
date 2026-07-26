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
    return cells.slice(0, 4);
  }).slice(0, 15);
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
    rows[0].forEach((cell) => addCell(headerRow, "th", cell));
    header.append(headerRow);

    const body = document.createElement("tbody");
    rows.slice(1).forEach((cells) => {
      const row = document.createElement("tr");
      cells.forEach((cell) => addCell(row, "td", cell));
      body.append(row);
    });

    trackerTable.replaceChildren(header, body);
  } catch (error) {
    trackerTable.innerHTML = "<caption>Tracker data is currently unavailable.</caption>";
  }
}

renderTracker();
