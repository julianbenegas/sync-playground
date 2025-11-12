export async function gqlQuery<T = unknown>(args: {
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      query: args.query,
      variables: args.variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e: { message: string }) => e.message).join(", ")}`
    );
  }

  return result.data;
}

