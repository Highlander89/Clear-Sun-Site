export default function BulkCloseRulesPage() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', lineHeight: 1.45 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Bulk Close: How the Bot Interprets Your Message</h1>
      <p style={{ opacity: 0.85, maxWidth: 900 }}>
        This page documents the exact parsing rules for the end-of-day “bulk closing” WhatsApp message so the team can
        predict where values will land in the sheet.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 24 }}>1) Message structure</h2>
      <ul>
        <li>
          <b>Hours section</b>: many machine lines (FEL/ADT/EXC/GEN/SCRN/BULLD/DOZ)
        </li>
        <li>
          <b>Loads sections</b> (optional): headings then ADT lines
          <ul>
            <li>
              <code>QUARRY</code> → writes ADT loads to column <b>H</b>
            </li>
            <li>
              <code>Tailings</code> → writes ADT loads to column <b>K</b>
            </li>
            <li>
              <code>SCREEN MATERIAL</code> / <code>SRCEEN MATERIAL</code> → writes ADT loads to column <b>J</b>
            </li>
          </ul>
        </li>
        <li>
          <b>Diesel section</b> (optional): heading <code>DIESEL</code> then machine litre lines → writes diesel to column <b>F</b>
        </li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 24 }}>2) Hours lines (closing hours + service info)</h2>
      <p style={{ opacity: 0.85, maxWidth: 900 }}>Format examples:</p>
      <ul>
        <li>
          <code>GEN 002 5859 (5750)</code>
        </li>
        <li>
          <code>ADT 004 17662 (18000)</code>
        </li>
        <li>
          <code>BULLD 12 5447 (5500)</code>
        </li>
      </ul>

      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, maxWidth: 1000 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Interpretation rule for the bracket value</h3>
        <p style={{ marginTop: 8, opacity: 0.9 }}>
          Let <b>closing</b> = the number after the machine code, and <b>bracket</b> = the number in parentheses.
        </p>
        <ul style={{ marginTop: 8 }}>
          <li>
            If <b>bracket &lt; closing</b> → bracket is treated as <b>last service hours</b>. The bot computes:
            <br />
            <code>nextDue = bracket + interval</code> (interval is <b>250</b> for most machines, <b>500</b> for BULLD 12)
          </li>
          <li>
            Otherwise (bracket ≥ closing) → bracket is treated as <b>next service due hours</b> directly.
          </li>
        </ul>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 24 }}>3) Where values are written</h2>
      <ul>
        <li>
          Machine closing hours → machine tab column <b>D</b> (and <b>D35</b>)
        </li>
        <li>
          Services sheet:
          <ul>
            <li>
              <b>C</b> = hours at last service
            </li>
            <li>
              <b>D</b> = next service due hours
            </li>
            <li>
              <b>E</b> = current hours (today) — header cell <code>Services!E1</code> is auto-updated to today’s date
            </li>
          </ul>
        </li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 24 }}>4) Loads</h2>
      <ul>
        <li>
          Only ADT lines like <code>ADT 002 = 20</code> are treated as loads.
        </li>
        <li>
          <b>Never writes to column L</b> (we keep formulas/zeros intact in that column).
        </li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 24 }}>5) Diesel inside bulk close</h2>
      <ul>
        <li>
          After the <code>DIESEL</code> heading, lines like <code>FEL 003 172L</code> are parsed and written to the machine tab diesel cell
          <b>F</b> for the day.
        </li>
        <li>
          Diesel is <b>accumulated</b> (if the cell already has a number, we add to it).
        </li>
      </ul>

      <hr style={{ margin: '28px 0', border: 'none', borderTop: '1px solid #eee' }} />
      <p style={{ opacity: 0.8 }}>
        If the team changes the WhatsApp format, update this page together with the parser so the dashboard stays truthful.
      </p>
    </div>
  );
}
