import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

async function main() {
  console.log("Testing Supabase REST connection...");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const { data, error } = await supabase.from("newsletter_instances").select("id").limit(1);
  if (error) throw new Error(`Supabase REST error: ${error.message}`);
  console.log("✓ Supabase REST connected — newsletter_instances table reachable");

  console.log("\nTesting LangGraph Postgres checkpointer connection...");
  const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_CONNECTION_STRING!);
  await checkpointer.setup();
  console.log("✓ LangGraph checkpointer connected and tables created");

  console.log("\nAll connections OK.");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Connection failed:", err.message);
  process.exit(1);
});
