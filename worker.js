export default {
  async fetch(request) {
    return new Response(`<!DOCTYPE html>
    <!-- paste your full HTML here -->`, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  },
};
