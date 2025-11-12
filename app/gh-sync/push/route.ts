import { push, pushBodySchema } from "@/sync";
import { sync } from "..";
import { transact } from "../transaction";

export const POST = async (request: Request) => {
  const body = await request.json();

  await transact(async (tx) => {
    return await push({
      sync,
      body: pushBodySchema.parse(body),
      tx,
    });
  });

  return Response.json({ ok: true });
};
