package dbcopy

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"

	_ "modernc.org/sqlite"

	"github.com/trymetis/metis/apps/cli/internal/hrana"
)

const (
	pageRows       = 1000
	pageBytes      = 8_000_000
	valueArgBytes  = 4 << 20
	batchStatement = 500
	batchBytes     = 1 << 20
	schemaQuery    = `SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite\_%' ESCAPE '\' AND name NOT LIKE 'libsql\_%' ESCAPE '\' ORDER BY rowid`
	tablesQuery    = `SELECT name FROM sqlite_schema WHERE type IN ('table', 'view', 'index', 'trigger') AND name NOT LIKE 'sqlite\_%' ESCAPE '\' AND name NOT LIKE 'libsql\_%' ESCAPE '\' LIMIT 1`
	sequenceExists = `SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'`
)

type object struct {
	Type  string
	Name  string
	Table string
	SQL   string
}

type table struct {
	object
	Columns      []string
	Keys         []string
	WithoutRowid bool
}

type Summary struct {
	Tables int
	Rows   int64
}

func quote(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func text(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case []byte:
		return string(typed)
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func objectsFrom(rows [][]any) []object {
	out := make([]object, 0, len(rows))
	for _, row := range rows {
		out = append(out, object{Type: text(row[0]), Name: text(row[1]), Table: text(row[2]), SQL: text(row[3])})
	}
	return out
}

func withoutRowid(sql string) bool {
	return strings.Contains(strings.ToUpper(strings.Join(strings.Fields(sql), " ")), "WITHOUT ROWID")
}

func selectList(columns []string) string {
	parts := make([]string, 0, len(columns))
	for _, column := range columns {
		parts = append(parts, "+"+quote(column))
	}
	return strings.Join(parts, ", ")
}

func insertColumns(t table) []string {
	columns := make([]string, 0, len(t.Columns)+1)
	if !t.WithoutRowid {
		columns = append(columns, "rowid")
	}
	for _, column := range t.Columns {
		columns = append(columns, quote(column))
	}
	return columns
}

func insertSQL(t table) string {
	columns := insertColumns(t)
	marks := strings.TrimSuffix(strings.Repeat("?, ", len(columns)), ", ")
	return fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", quote(t.Name), strings.Join(columns, ", "), marks)
}

func literal(value any) (string, bool) {
	switch typed := value.(type) {
	case []byte:
		if len(typed) > valueArgBytes {
			return "x'" + hex.EncodeToString(typed) + "'", true
		}
	case string:
		if len(typed) > valueArgBytes {
			return "CAST(x'" + hex.EncodeToString([]byte(typed)) + "' AS TEXT)", true
		}
	}
	return "", false
}

func insertStmt(t table, insert string, cells []any) hrana.Stmt {
	marks := make([]string, len(cells))
	var args []any
	inlined := false
	for index, cell := range cells {
		if text, ok := literal(cell); ok {
			marks[index] = text
			inlined = true
			continue
		}
		marks[index] = "?"
		args = append(args, cell)
	}
	if !inlined {
		return hrana.Stmt{SQL: insert, Args: cells}
	}
	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", quote(t.Name), strings.Join(insertColumns(t), ", "), strings.Join(marks, ", "))
	return hrana.Stmt{SQL: sql, Args: args}
}

func keyList(t table) []string {
	keys := make([]string, 0, len(t.Keys))
	for _, key := range t.Keys {
		keys = append(keys, quote(key))
	}
	return keys
}

func dataList(t table) string {
	if t.WithoutRowid {
		return selectList(t.Columns)
	}
	return "rowid, " + selectList(t.Columns)
}

func sizeList(t table) string {
	parts := make([]string, 0, len(t.Columns))
	for _, column := range t.Columns {
		parts = append(parts, fmt.Sprintf("coalesce(length(CAST(%s AS BLOB)), 0)", quote(column)))
	}
	total := strings.Join(parts, " + ")
	if t.WithoutRowid {
		return strings.Join(keyList(t), ", ") + ", " + total
	}
	return "rowid, " + total
}

func scanSQL(t table, list string, after bool) string {
	if !t.WithoutRowid {
		where := ""
		if after {
			where = " WHERE rowid > ?"
		}
		return fmt.Sprintf("SELECT %s FROM %s%s ORDER BY rowid LIMIT ?", list, quote(t.Name), where)
	}
	keys := keyList(t)
	where := ""
	if after {
		where = fmt.Sprintf(" WHERE (%s) > (%s)", strings.Join(keys, ", "), strings.TrimSuffix(strings.Repeat("?, ", len(keys)), ", "))
	}
	return fmt.Sprintf("SELECT %s FROM %s%s ORDER BY %s LIMIT ?", list, quote(t.Name), where, strings.Join(keys, ", "))
}

func pageLength(sizes [][]any) int {
	total := int64(0)
	for index, row := range sizes {
		size, _ := hrana.Int(row[len(row)-1])
		total += size
		if total > pageBytes && index > 0 {
			return index
		}
	}
	return len(sizes)
}

func cursor(t table, row []any) []any {
	if !t.WithoutRowid {
		return []any{row[0]}
	}
	out := make([]any, 0, len(t.Keys))
	for _, key := range t.Keys {
		for index, column := range t.Columns {
			if column == key {
				out = append(out, row[index])
			}
		}
	}
	return out
}

func remoteTable(ctx context.Context, src *hrana.Client, obj object) (table, error) {
	t := table{object: obj, WithoutRowid: withoutRowid(obj.SQL)}
	results, err := src.Execute(ctx,
		hrana.Stmt{SQL: "SELECT name, hidden FROM pragma_table_xinfo(?) ORDER BY cid", Args: []any{obj.Name}},
		hrana.Stmt{SQL: "SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk", Args: []any{obj.Name}},
	)
	if err != nil {
		return table{}, err
	}
	for _, row := range results[0].Rows {
		if hidden, _ := hrana.Int(row[1]); hidden == 0 {
			t.Columns = append(t.Columns, text(row[0]))
		}
	}
	for _, row := range results[1].Rows {
		t.Keys = append(t.Keys, text(row[0]))
	}
	if t.WithoutRowid && len(t.Keys) == 0 {
		return table{}, fmt.Errorf("%s is WITHOUT ROWID but has no primary key", obj.Name)
	}
	return t, nil
}

func Size(ctx context.Context, db *hrana.Client) (int64, error) {
	results, err := db.Execute(ctx, hrana.Stmt{SQL: "PRAGMA page_count"}, hrana.Stmt{SQL: "PRAGMA page_size"})
	if err != nil {
		return 0, err
	}
	if len(results[0].Rows) == 0 || len(results[1].Rows) == 0 {
		return 0, errors.New("the database did not report its size")
	}
	pages, err := hrana.Int(results[0].Rows[0][0])
	if err != nil {
		return 0, err
	}
	size, err := hrana.Int(results[1].Rows[0][0])
	if err != nil {
		return 0, err
	}
	return pages * size, nil
}

func Dump(ctx context.Context, src *hrana.Client, file string) (Summary, error) {
	if _, err := os.Stat(file); err == nil {
		return Summary{}, fmt.Errorf("%s already exists", file)
	}
	schema, err := src.Query(ctx, schemaQuery)
	if err != nil {
		return Summary{}, err
	}
	objects := objectsFrom(schema.Rows)
	local, err := openLocal(file)
	if err != nil {
		return Summary{}, err
	}
	defer local.Close()

	var tables []table
	for _, obj := range objects {
		if obj.Type != "table" {
			continue
		}
		if _, err := local.ExecContext(ctx, obj.SQL); err != nil {
			return Summary{}, fmt.Errorf("creating %s locally: %w", obj.Name, err)
		}
		t, err := remoteTable(ctx, src, obj)
		if err != nil {
			return Summary{}, err
		}
		tables = append(tables, t)
	}
	summary := Summary{Tables: len(tables)}
	for _, t := range tables {
		copied, err := dumpTable(ctx, src, local, t)
		if err != nil {
			return Summary{}, fmt.Errorf("copying %s: %w", t.Name, err)
		}
		summary.Rows += copied
	}
	if err := dumpSequence(ctx, src, local); err != nil {
		return Summary{}, err
	}
	for _, obj := range objects {
		if obj.Type == "table" {
			continue
		}
		if _, err := local.ExecContext(ctx, obj.SQL); err != nil {
			return Summary{}, fmt.Errorf("creating %s %s locally: %w", obj.Type, obj.Name, err)
		}
	}
	var check string
	if err := local.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&check); err != nil {
		return Summary{}, err
	}
	if check != "ok" {
		return Summary{}, fmt.Errorf("the copied database failed its integrity check: %s", check)
	}
	return summary, local.Close()
}

func openLocal(file string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", file)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

func dumpTable(ctx context.Context, src *hrana.Client, local *sql.DB, t table) (int64, error) {
	tx, err := local.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()
	insert, err := tx.PrepareContext(ctx, insertSQL(t))
	if err != nil {
		return 0, err
	}
	defer insert.Close()
	var copied int64
	var after []any
	for {
		args := func(limit int) []any { return append(append([]any{}, after...), int64(limit)) }
		sizes, err := src.Query(ctx, scanSQL(t, sizeList(t), after != nil), args(pageRows)...)
		if err != nil {
			return 0, err
		}
		if len(sizes.Rows) == 0 {
			break
		}
		take := pageLength(sizes.Rows)
		page, err := src.Query(ctx, scanSQL(t, dataList(t), after != nil), args(take)...)
		if err != nil {
			return 0, err
		}
		for _, row := range page.Rows {
			if _, err := insert.ExecContext(ctx, row...); err != nil {
				return 0, err
			}
		}
		copied += int64(len(page.Rows))
		if len(page.Rows) == 0 || (len(sizes.Rows) < pageRows && take == len(sizes.Rows)) {
			break
		}
		after = cursor(t, page.Rows[len(page.Rows)-1])
	}
	return copied, tx.Commit()
}

func dumpSequence(ctx context.Context, src *hrana.Client, local *sql.DB) error {
	exists, err := src.Query(ctx, sequenceExists)
	if err != nil {
		return err
	}
	if count, _ := hrana.Int(exists.Rows[0][0]); count == 0 {
		return nil
	}
	rows, err := src.Query(ctx, "SELECT name, seq FROM sqlite_sequence")
	if err != nil {
		return err
	}
	tx, err := local.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, "DELETE FROM sqlite_sequence"); err != nil {
		return err
	}
	for _, row := range rows.Rows {
		if _, err := tx.ExecContext(ctx, "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", row...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func Empty(ctx context.Context, dst *hrana.Client) error {
	rows, err := dst.Query(ctx, tablesQuery)
	if err != nil {
		return err
	}
	if len(rows.Rows) > 0 {
		return fmt.Errorf("the target database is not empty: it has %s; load only into an empty database", text(rows.Rows[0][0]))
	}
	return nil
}

type batcher struct {
	ctx   context.Context
	dst   *hrana.Client
	stmts []hrana.Stmt
	bytes int
}

func argBytes(args []any) int {
	total := 0
	for _, arg := range args {
		switch typed := arg.(type) {
		case string:
			total += len(typed)
		case []byte:
			total += len(typed) * 4 / 3
		default:
			total += 24
		}
	}
	return total
}

func (b *batcher) add(stmt hrana.Stmt) error {
	size := len(stmt.SQL) + argBytes(stmt.Args)
	if len(b.stmts) > 0 && (len(b.stmts) >= batchStatement || b.bytes+size > batchBytes) {
		if err := b.flush(); err != nil {
			return err
		}
	}
	b.stmts = append(b.stmts, stmt)
	b.bytes += size
	return nil
}

func (b *batcher) flush() error {
	if len(b.stmts) == 0 {
		return nil
	}
	body := b.stmts
	b.stmts = nil
	b.bytes = 0
	return b.dst.Transaction(b.ctx, []hrana.Stmt{{SQL: "PRAGMA foreign_keys = OFF"}}, body)
}

func localObjects(ctx context.Context, local *sql.DB) ([]object, error) {
	rows, err := local.QueryContext(ctx, schemaQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []object
	for rows.Next() {
		var obj object
		if err := rows.Scan(&obj.Type, &obj.Name, &obj.Table, &obj.SQL); err != nil {
			return nil, err
		}
		out = append(out, obj)
	}
	return out, rows.Err()
}

func localTable(ctx context.Context, local *sql.DB, obj object) (table, error) {
	t := table{object: obj, WithoutRowid: withoutRowid(obj.SQL)}
	rows, err := local.QueryContext(ctx, "SELECT name, hidden FROM pragma_table_xinfo(?) ORDER BY cid", obj.Name)
	if err != nil {
		return table{}, err
	}
	for rows.Next() {
		var name string
		var hidden int64
		if err := rows.Scan(&name, &hidden); err != nil {
			_ = rows.Close()
			return table{}, err
		}
		if hidden == 0 {
			t.Columns = append(t.Columns, name)
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return table{}, err
	}
	return t, rows.Close()
}

func Load(ctx context.Context, file string, dst *hrana.Client) (Summary, error) {
	if _, err := os.Stat(file); err != nil {
		return Summary{}, err
	}
	if err := Empty(ctx, dst); err != nil {
		return Summary{}, err
	}
	local, err := openLocal(file)
	if err != nil {
		return Summary{}, err
	}
	defer local.Close()
	objects, err := localObjects(ctx, local)
	if err != nil {
		return Summary{}, err
	}
	b := &batcher{ctx: ctx, dst: dst}
	var tables []table
	for _, obj := range objects {
		if obj.Type != "table" {
			continue
		}
		if err := b.add(hrana.Stmt{SQL: obj.SQL}); err != nil {
			return Summary{}, err
		}
		t, err := localTable(ctx, local, obj)
		if err != nil {
			return Summary{}, err
		}
		tables = append(tables, t)
	}
	if err := b.flush(); err != nil {
		return Summary{}, fmt.Errorf("creating the tables: %w", err)
	}
	counts := map[string]int64{}
	summary := Summary{Tables: len(tables)}
	for _, t := range tables {
		count, err := loadTable(ctx, local, b, t)
		if err != nil {
			return Summary{}, fmt.Errorf("loading %s: %w", t.Name, err)
		}
		counts[t.Name] = count
		summary.Rows += count
	}
	if err := b.flush(); err != nil {
		return Summary{}, fmt.Errorf("loading rows: %w", err)
	}
	if err := loadSequence(ctx, local, b); err != nil {
		return Summary{}, err
	}
	for _, obj := range objects {
		if obj.Type == "table" {
			continue
		}
		if err := b.add(hrana.Stmt{SQL: obj.SQL}); err != nil {
			return Summary{}, err
		}
	}
	if err := b.flush(); err != nil {
		return Summary{}, fmt.Errorf("creating indexes, triggers and views: %w", err)
	}
	for _, t := range tables {
		rows, err := dst.Query(ctx, "SELECT COUNT(*) FROM "+quote(t.Name))
		if err != nil {
			return Summary{}, err
		}
		if count, _ := hrana.Int(rows.Rows[0][0]); count != counts[t.Name] {
			return Summary{}, fmt.Errorf("%s has %d rows after loading, the export has %d", t.Name, count, counts[t.Name])
		}
	}
	return summary, nil
}

func loadTable(ctx context.Context, local *sql.DB, b *batcher, t table) (count int64, err error) {
	query := fmt.Sprintf("SELECT %s FROM %s", selectList(t.Columns), quote(t.Name))
	if !t.WithoutRowid {
		query = fmt.Sprintf("SELECT rowid, %s FROM %s ORDER BY rowid", selectList(t.Columns), quote(t.Name))
	}
	rows, err := local.QueryContext(ctx, query)
	if err != nil {
		return 0, err
	}
	defer func() {
		if closeErr := rows.Close(); err == nil {
			err = closeErr
		}
	}()
	width := len(t.Columns)
	if !t.WithoutRowid {
		width++
	}
	insert := insertSQL(t)
	for rows.Next() {
		cells := make([]any, width)
		pointers := make([]any, width)
		for index := range cells {
			pointers[index] = &cells[index]
		}
		if err := rows.Scan(pointers...); err != nil {
			return 0, err
		}
		if err := b.add(insertStmt(t, insert, cells)); err != nil {
			return 0, err
		}
		count++
	}
	return count, rows.Err()
}

func loadSequence(ctx context.Context, local *sql.DB, b *batcher) error {
	var exists int
	if err := local.QueryRowContext(ctx, sequenceExists).Scan(&exists); err != nil || exists == 0 {
		return err
	}
	rows, err := local.QueryContext(ctx, "SELECT name, seq FROM sqlite_sequence")
	if err != nil {
		return err
	}
	var entries [][]any
	for rows.Next() {
		var name string
		var seq int64
		if err := rows.Scan(&name, &seq); err != nil {
			_ = rows.Close()
			return err
		}
		entries = append(entries, []any{name, seq})
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := b.flush(); err != nil {
		return err
	}
	if err := b.add(hrana.Stmt{SQL: "DELETE FROM sqlite_sequence"}); err != nil {
		return err
	}
	for _, entry := range entries {
		if err := b.add(hrana.Stmt{SQL: "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", Args: entry}); err != nil {
			return err
		}
	}
	return b.flush()
}
