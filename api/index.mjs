import app from "../server/index.mjs";

export default function handler(request, response) {
  return app(request, response);
}
