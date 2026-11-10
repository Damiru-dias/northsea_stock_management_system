export const money = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
export const dateLabel = (value) => value ? new Date(`${value.replace(" ", "T")}Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
export const localDateValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export function generateSuggestedPassword() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*"];
  const allCharacters = groups.join("");
  const pick = (characters) => characters[crypto.getRandomValues(new Uint32Array(1))[0] % characters.length];
  const password = groups.map(pick);
  while (password.length < 16) password.push(pick(allCharacters));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swap = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [password[index], password[swap]] = [password[swap], password[index]];
  }
  return password.join("");
}
export const roleName = { admin: "Administrator", manager: "Factory manager", keeper: "Stock keeper", supervisor: "Section supervisor" };
export const statusClass = (status) => status?.toLowerCase().replaceAll("_", "-") || "pending";
