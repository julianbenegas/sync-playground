import { pull, pullBodySchema } from "@/sync";
import { sync } from "..";
import { transact } from "../transaction";

export const POST = async (request: Request) => {
  const body = await request.json();
  const result = await transact(async (tx) => {
    return await pull({
      sync,
      body: pullBodySchema.parse(body),
      tx,
    });
  });

  return Response.json(result);
};
