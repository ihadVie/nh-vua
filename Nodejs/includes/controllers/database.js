const path = require("path");
const fs = require("fs-extra");
const sqlite3 = require("sqlite3").verbose();

const databasePath = path.join(__dirname, "..", "..", "Fca_Database", "database.sqlite");
fs.ensureDirSync(path.dirname(databasePath));

const db = new sqlite3.Database(databasePath);

const tableCache = {};

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) return reject(err);
        return resolve(this);
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        return resolve(row);
    });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows);
    });
});

const tableExists = async (name) => {
    const row = await get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        [name]
    );
    return Boolean(row);
};

const getTableInfo = async (name) => all(`PRAGMA table_info(${name})`);

const resolveUsersTable = async () => {
    if (tableCache.users) return tableCache.users;

    if (await tableExists("Users")) {
        const columns = await getTableInfo("Users");
        const columnNames = columns.map((col) => col.name);
        tableCache.users = {
            table: "Users",
            idColumn: "userID",
            nameColumn: columnNames.includes("name") ? "name" : null,
            dataColumn: "data"
        };
        return tableCache.users;
    }

    await run(
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            data TEXT DEFAULT '{}',
            createdAt INTEGER,
            updatedAt INTEGER
        )`
    );

    tableCache.users = {
        table: "users",
        idColumn: "id",
        nameColumn: "name",
        dataColumn: "data"
    };
    return tableCache.users;
};

const resolveThreadsTable = async () => {
    if (tableCache.threads) return tableCache.threads;

    if (await tableExists("Threads")) {
        const columns = await getTableInfo("Threads");
        const columnNames = columns.map((col) => col.name);
        tableCache.threads = {
            table: "Threads",
            idColumn: "threadID",
            nameColumn: columnNames.includes("name") ? "name" : null,
            dataColumn: "data"
        };
        return tableCache.threads;
    }

    await run(
        `CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            name TEXT,
            data TEXT DEFAULT '{}',
            createdAt INTEGER,
            updatedAt INTEGER
        )`
    );

    tableCache.threads = {
        table: "threads",
        idColumn: "id",
        nameColumn: "name",
        dataColumn: "data"
    };
    return tableCache.threads;
};

const resolveCurrenciesTable = async () => {
    if (tableCache.currencies) return tableCache.currencies;

    if (!(await tableExists("currencies"))) {
        await run(
            `CREATE TABLE IF NOT EXISTS currencies (
                id TEXT PRIMARY KEY,
                money INTEGER DEFAULT 0,
                data TEXT DEFAULT '{}',
                createdAt INTEGER,
                updatedAt INTEGER
            )`
        );
    }

    tableCache.currencies = {
        table: "currencies",
        idColumn: "id",
        dataColumn: "data",
        moneyColumn: "money"
    };
    return tableCache.currencies;
};

const initDatabase = async () => {
    await resolveUsersTable();
    await resolveThreadsTable();
    await resolveCurrenciesTable();
};

module.exports = {
    db,
    run,
    get,
    all,
    initDatabase,
    databasePath,
    resolveUsersTable,
    resolveThreadsTable,
    resolveCurrenciesTable
};
