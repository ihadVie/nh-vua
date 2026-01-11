const { run, get, all, resolveThreadsTable } = require("./database");

const parseData = (data) => {
    if (!data) return {};
    try {
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
};

const normalizeThread = (threadID, payload = {}, current = {}) => {
    const dataPayload = payload.data && typeof payload.data === "object" ? payload.data : {};
    const mergedData = {
        ...(current.data || {}),
        ...dataPayload
    };

    return {
        threadID,
        name: payload.name || current.name || "",
        data: mergedData
    };
};

const create = async (threadID, payload = {}) => {
    const tableInfo = await resolveThreadsTable();
    const now = Date.now();
    const normalized = normalizeThread(threadID, payload);
    const dataPayload = tableInfo.nameColumn
        ? normalized.data
        : { ...normalized.data, name: normalized.name };

    const columns = [tableInfo.idColumn, tableInfo.dataColumn, "createdAt", "updatedAt"];
    const values = [threadID, JSON.stringify(dataPayload), now, now];

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

const getThread = async (threadID) => {
    const tableInfo = await resolveThreadsTable();
    const row = await get(
        `SELECT * FROM ${tableInfo.table} WHERE ${tableInfo.idColumn} = ?`,
        [threadID]
    );
    if (!row) return null;
    const data = parseData(row[tableInfo.dataColumn]);
    return {
        threadID: row[tableInfo.idColumn],
        name: tableInfo.nameColumn ? row[tableInfo.nameColumn] || "" : data.name || "",
        data
    };
};

const set = async (threadID, payload = {}) => {
    const tableInfo = await resolveThreadsTable();
    const current = (await getThread(threadID)) || (await create(threadID));
    const normalized = normalizeThread(threadID, payload, current);
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
    values.push(threadID);

    await run(
        `UPDATE ${tableInfo.table} SET ${updates.join(", ")} WHERE ${tableInfo.idColumn} = ?`,
        values
    );

    return normalized;
};

const getAll = async () => {
    const tableInfo = await resolveThreadsTable();
    const rows = await all(`SELECT * FROM ${tableInfo.table}`);
    return rows.map((row) => ({
        threadID: row[tableInfo.idColumn],
        name: tableInfo.nameColumn
            ? row[tableInfo.nameColumn] || ""
            : (parseData(row[tableInfo.dataColumn]).name || ""),
        data: parseData(row[tableInfo.dataColumn])
    }));
};

const getData = async (threadID) => {
    const existing = await getThread(threadID);
    if (existing) return existing;
    return create(threadID);
};

const setData = async (threadID, payload) => set(threadID, payload);

module.exports = {
    get: getThread,
    set,
    create,
    getAll,
    getData,
    setData
};
