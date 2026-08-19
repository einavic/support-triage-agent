import "dotenv/config";
import { escalateToHuman } from "./tools/escalateToHuman.js";

const result = await escalateToHuman({
  reason: "test",
  summary: "This is a test escalation from my agent project.",
  urgency: "low"
});

console.log(result);