export function apiErrorResponse(error) {
    const message = error instanceof Error ? error.message : "The request could not be completed.";
    const status = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode
        : message.startsWith("Unauthorized") ? 401
        : message.startsWith("Forbidden") ? 403
            : error?.number || error?.code ? 500 : 400;
    if (status >= 500) {
        console.error("API request failed.", error);
        return Response.json({ error: "The server could not complete the request." }, { status });
    }
    return Response.json({ error: message }, { status });
}

export async function readJsonBody(request) {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1024 * 1024) throw new Error("Request body must be smaller than 1 MB.");
    try {
        return await request.json();
    }
    catch {
        throw new Error("Request body must be valid JSON.");
    }
}
