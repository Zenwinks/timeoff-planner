// La lecture des blocs COPY d'un dump SQL de Postgres (pg_dump, format texte) :
//
//   COPY public.yearly_rtt (id, user_id, year, rtt_count, created_at) FROM stdin;
//   <colonnes séparées par des tabulations>
//   \.
//
// Les valeurs restent du texte, exactement comme Postgres les a écrites ; NULL
// devient null. https://www.postgresql.org/docs/current/sql-copy.html#id-1.9.3.55.9.2

const ESCAPES = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }

/** Une valeur du format texte de COPY, décodée. */
export function decodeCopyValue(raw) {
  if (raw === '\\N') return null
  return raw.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_, code) => {
    if (code[0] === 'x' && code.length > 1) return String.fromCharCode(parseInt(code.slice(1), 16))
    if (/^[0-7]/.test(code)) return String.fromCharCode(parseInt(code, 8))
    return ESCAPES[code] ?? code
  })
}

/** Les lignes de la table `name` (ex. 'public.yearly_rtt'), en objets colonne → texte. */
export function readCopyTable(sql, name) {
  const lines = sql.split('\n')
  const header = new RegExp(`^COPY ${name.replace('.', '\\.')} \\((.+)\\) FROM stdin;$`)
  const start = lines.findIndex(l => header.test(l))
  if (start < 0) throw new Error(`Table ${name} absente du dump.`)
  const columns = header.exec(lines[start])[1].split(', ').map(c => c.replace(/^"|"$/g, ''))
  const rows = []
  for (let i = start + 1; ; i++) {
    if (i >= lines.length) throw new Error(`Table ${name} : fin du bloc COPY introuvable.`)
    const line = lines[i].replace(/\r$/, '')
    if (line === '\\.') break
    const values = line.split('\t')
    if (values.length !== columns.length) throw new Error(`Table ${name}, ligne ${i + 1} : ${values.length} valeurs pour ${columns.length} colonnes.`)
    rows.push(Object.fromEntries(columns.map((c, j) => [c, decodeCopyValue(values[j])])))
  }
  return rows
}
