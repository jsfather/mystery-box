type LCDLine = {
  cursor: { x: number; y: 0 | 1 };
  text: string;
};

type LCDProps = {
  lines?: LCDLine[];
};

export default function LCD({ lines }: LCDProps) {
  const totalCols = 16;
  const totalRows = 2;

  const screen = Array(totalRows)
    .fill(null)
    .map(() => Array(totalCols).fill('\u00A0'));

  if (lines && lines.length > 0) {
    for (const { cursor, text } of lines) {
      const { x: col, y: row } = cursor;

      if (row >= totalRows || col >= totalCols) continue;

      let c = col;

      for (let i = 0; i < text.length; i++) {
        if (c >= totalCols) break;
        screen[row][c] = text[i];
        c++;
      }
    }
  }

  return (
    <div className="font-jersey-10 inline-block rounded-sm bg-blue-500 px-6 py-3 select-none">
      {screen.map((rowChars, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'flex',
            gap: '2px',
            fontSize: '32px',
            marginBottom: rowIndex === totalRows - 1 ? 0 : '4px',
            minHeight: '40px',
            alignItems: 'center',
          }}
        >
          {rowChars.map((char, colIndex) => (
            <span
              key={colIndex}
              style={{
                color: 'white',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                width: '30px',
                textAlign: 'center',
                display: 'inline-block',
              }}
            >
              {char}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
