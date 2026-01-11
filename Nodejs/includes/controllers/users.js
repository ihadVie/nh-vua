const { run, get, all, resolveUsersTable } = require("./database");

const parseData = (data) => {
    if (!data) return {};
    try {
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
};

const normalizeUser = (uid, payload = {}, current = {}) => {
    const dataPayload = payload.data && typeof payload.data === "object" ? payload.data : {};
    const mergedData = {
        ...(current.data || {}),
        ...dataPayload
    };

    return {
        uid,
        name: payload.name || current.name || "User",
        data: mergedData
    };
};

const create = async (uid, payload = {}) => {
    const tableInfo = await resolveUsersTable();
    const now = Date.now();
    const normalized = normalizeUser(uid, payload);
    const dataPayload = tableInfo.nameColumn
        ? normalized.data
        : { ...normalized.data, name: normalized.name };

    const columns = [tableInfo.idColumn, tableInfo.dataColumn, "createdAt", "updatedAt"];
    const values = [uid, JSON.stringify(dataPayload), now, now];

    if (tableInfo.nameColumn) {
        columns.splice(1, 0, tableInfo.nameColumn);
        values.splice(1, 0, normalized.name);
    }

    await run(
        `INSERT OR IGNORE INTO ${tableInfo.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        values
    );
    return normalized;
};

const getUser = async (uid) => {
    const tableInfo = await resolveUsersTable();
    const row = await get(
        `SELECT * FROM ${tableInfo.table} WHERE ${tableInfo.idColumn} = ?`,
        [uid]
    );
    if (!row) return null;
    const data = parseData(row[tableInfo.dataColumn]);
    return {
        uid: row[tableInfo.idColumn],
        name: tableInfo.nameColumn ? row[tableInfo.nameColumn] || "User" : data.name || "User",
        data
    };
};

const set = async (uid, payload = {}) => {
    const tableInfo = await resolveUsersTable();
    const current = (await getUser(uid)) || (await create(uid));
    const normalized = normalizeUser(uid, payload, current);
    const now = Date.now();
    const dataPayload = tableInfo.nameColumn
        ? normalized.data
        : { ...normalized.data, name: normalized.name };

    const updates = [];
    const values = [];

    if (tableInfo.nameColumn) {
        updates.push(`${tableInfo.nameColumn} = ?`);
        values.push(normalized.name);
    }

    updates.push(`${tableInfo.dataColumn} = ?`);
    values.push(JSON.stringify(dataPayload));
    updates.push("updatedAt = ?");
    values.push(now);
    values.push(uid);

    await run(
        `UPDATE ${tableInfo.table} SET ${updates.join(", ")} WHERE ${tableInfo.idColumn} = ?`,
        values
    );

    return normalized;
};

const getAll = async () => {
    const tableInfo = await resolveUsersTable();
    const rows = await all(`SELECT * FROM ${tableInfo.table}`);
    return rows.map((row) => ({
        uid: row[tableInfo.idColumn],
        name: tableInfo.nameColumn
            ? row[tableInfo.nameColumn] || "User"
            : (parseData(row[tableInfo.dataColumn]).name || "User"),
        data: parseData(row[tableInfo.dataColumn])
    }));
};

const getData = async (uid) => {
    const existing = await getUser(uid);
    if (existing) return existing;
    return create(uid);
};

const setData = async (uid, payload) => set(uid, payload);

const getNameUser = async (uid) => {
    const user = await getData(uid);
    return user.name || "User";
};

module.exports = {
    get: getUser,
    set,
    create,
    getAll,
    getData,
    setData,
    getNameUser
};
