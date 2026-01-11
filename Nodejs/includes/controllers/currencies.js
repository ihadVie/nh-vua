const { run, get, all } = require("./database");

const parseData = (data) => {
    if (!data) return {};
    try {
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
};

const normalizeCurrency = (uid, payload = {}, current = {}) => {
    const dataPayload = payload.data && typeof payload.data === "object" ? payload.data : {};
    const mergedData = {
        ...(current.data || {}),
        ...dataPayload
    };

    const moneyValue = payload.money !== undefined ? payload.money : current.money || 0;

    return {
        uid,
        money: Number(moneyValue) || 0,
        data: mergedData
    };
};

const create = async (uid, payload = {}) => {
    const now = Date.now();
    const normalized = normalizeCurrency(uid, payload);
    await run(
        "INSERT OR IGNORE INTO currencies (id, money, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
        [uid, normalized.money, JSON.stringify(normalized.data), now, now]
    );
    return normalized;
};

const getCurrency = async (uid) => {
    const row = await get("SELECT * FROM currencies WHERE id = ?", [uid]);
    if (!row) return null;
    return {
        uid: row.id,
        money: Number(row.money) || 0,
        data: parseData(row.data)
    };
};

const set = async (uid, payload = {}) => {
    const current = (await getCurrency(uid)) || (await create(uid));
    const normalized = normalizeCurrency(uid, payload, current);
    const now = Date.now();

    await run(
        "UPDATE currencies SET money = ?, data = ?, updatedAt = ? WHERE id = ?",
        [normalized.money, JSON.stringify(normalized.data), now, uid]
    );

    return normalized;
};

const getAll = async () => {
    const rows = await all("SELECT * FROM currencies");
    return rows.map((row) => ({
        uid: row.id,
        money: Number(row.money) || 0,
        data: parseData(row.data)
    }));
};

const getData = async (uid) => {
    const existing = await getCurrency(uid);
    if (existing) return existing;
    return create(uid);
};

const setData = async (uid, payload) => set(uid, payload);

const increaseMoney = async (uid, amount) => {
    const current = await getData(uid);
    const updated = {
        ...current,
        money: (Number(current.money) || 0) + Number(amount || 0)
    };
    return set(uid, updated);
};

const decreaseMoney = async (uid, amount) => {
    const current = await getData(uid);
    const updated = {
        ...current,
        money: (Number(current.money) || 0) - Number(amount || 0)
    };
    return set(uid, updated);
};

module.exports = {
    get: getCurrency,
    set,
    create,
    getAll,
    getData,
    setData,
    increaseMoney,
    decreaseMoney
};
