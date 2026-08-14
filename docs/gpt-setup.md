# Private GPT setup

1. Deploy the Worker and complete Cloudflare Access first.
2. In Access, create a dedicated service token named `Personal OS GPT`.
3. Add a `Service Auth` policy that includes only that token.
4. Configure the self-hosted Access application to read service credentials
   from the single header `Authorization`.
5. Save the service token client ID as the Worker variable
   `GPT_SERVICE_TOKEN_ID_SECRET`. Never save its client secret in this repository.
6. Open ChatGPT on the web and create a GPT named `Personal OS`.
7. Keep visibility `Only me` and upload no personal Knowledge files.
8. Paste `docs/gpt-instructions.md` into Instructions.
   Keep this file below ChatGPT's 8,000-character Instructions limit.
9. Add a Custom Action and import `docs/personal-os-actions.openapi.yaml`.
10. Select API key authentication, type `Custom header`, header name
    `Authorization`. The secret value has this exact JSON shape on one line:

```json
{"cf-access-client-id":"CLIENT_ID","cf-access-client-secret":"CLIENT_SECRET"}
```

11. Test `getPersonalContext` and `proposeOperations` in Preview. Verify that a
    proposal appears in the PWA and cannot be confirmed by the GPT.
    Also test `domain=home` and `domain=insights`, then create one synthetic
    nutrition or maintenance proposal and reject it in the PWA.
12. Save the GPT privately and place its URL in
    `VITE_PERSONAL_OS_GPT_URL` before the final PWA build.

Use a model that supports Actions; Pro mode cannot execute them. Revoke and
replace the service token immediately if the secret is ever copied outside the
GPT editor or Cloudflare's one-time display.

## Production verification

The current schema version is `1.3.0`. After each instruction or Action update,
verify `Only me` visibility, no Knowledge files, a successful read-only context
call and the inability to confirm or delete records. An empty personal state is
valid before source-driven population; technical catalogs may still be present.
