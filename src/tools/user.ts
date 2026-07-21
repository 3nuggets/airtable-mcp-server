import { run, type ToolRegistrar } from "./helpers";

export const registerUserTools: ToolRegistrar = (server, ctx) => {
  server.tool(
    "whoami",
    "Return the authenticated Airtable user's id, email (if user.email:read was granted), and the token's scopes.",
    {},
    async () => run(() => ctx.client.get(`/v0/meta/whoami`)),
  );
};
