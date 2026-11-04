import sql from "mssql";

let connectionPromise;

function getSqlConfig() {
    const required = ["SQL_SERVER", "SQL_DATABASE", "SQL_USER", "SQL_PASSWORD"];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) {
        throw Object.assign(
            new Error(`Missing server environment variable(s): ${missing.join(", ")}.`),
            { statusCode: 503 },
        );
    }

    return {
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        port: Number(process.env.SQL_PORT || 1433),
        connectionTimeout: 15000,
        requestTimeout: 30000,
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
        options: {
            encrypt: process.env.SQL_ENCRYPT !== "false",
            trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === "true",
            enableArithAbort: true,
        },
    };
}

export async function getSqlPool() {
    if (!connectionPromise) {
        connectionPromise = new sql.ConnectionPool(getSqlConfig())
            .connect()
            .catch((error) => {
                connectionPromise = undefined;
                console.error("Could not connect to SQL Server.", error);
                throw Object.assign(
                    new Error("SQL Server is unavailable. Check the server connection and database configuration.", { cause: error }),
                    { statusCode: 503 },
                );
            });
    }
    return connectionPromise;
}

export { sql };
