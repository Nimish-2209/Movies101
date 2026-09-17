const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const filmsScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'films.js'),
  'utf8'
);

class FakeElement {
  constructor() {
    this.attributes = {};
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this._innerHTML = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;

    if (value === '') {
      this.children = [];
    }
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  focus() {}

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

function createStorage(values = new Map()) {
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function createClient(storage, fetchImplementation) {
  const elementIds = [
    'filmListTitle',
    'filmTableBody',
    'filmTableHeaderRow',
    'filmTableSection',
    'filmTitle',
    'catalogQuery',
    'filmRating',
    'login',
    'loginForm',
    'loginPassword',
    'loginStatus',
    'logoutButton',
    'memberActions',
    'memberMovieResults',
    'myFilmFilters',
    'filmFilterEmpty',
    'saveUpdateButton',
    'statusMessage',
    'assistantLauncher',
    'movieAssistant',
    'assistantMessages',
    'assistantInput',
    'assistantSend'
  ];
  const elements = new Map(elementIds.map((id) => [id, new FakeElement()]));
  const window = { sessionStorage: storage };
  const context = vm.createContext({
    console,
    document: {
      createElement: () => new FakeElement(),
      getElementById: (id) => elements.get(id),
      querySelectorAll: () => []
    },
    fetch: fetchImplementation,
    window
  });
  const testableScript = filmsScript.replace(
    /API\.restoreSession\(\);\s*$/,
    'globalThis.restorePromise = API.restoreSession(); globalThis.testApi = API;'
  );

  vm.runInContext(testableScript, context);

  return { context, elements };
}

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async json() {
      return data;
    }
  };
}

test('a successful login survives a page reload in the same tab', async () => {
  const storage = createStorage();
  const token = 'test.jwt.token';
  const firstPage = createClient(storage, async (url, options = {}) => {
    if (url.endsWith('/login')) {
      return jsonResponse(200, {
        token,
        user: { username: 'Nimish' }
      });
    }

    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    return jsonResponse(200, []);
  });

  await firstPage.context.restorePromise;
  firstPage.elements.get('login').value = 'Nimish';
  firstPage.elements.get('loginPassword').value = 'password123';
  await firstPage.context.testApi.login();

  assert.deepEqual(JSON.parse(storage.getItem('movies101-session')), {
    token,
    username: 'Nimish'
  });

  await firstPage.context.testApi.saveRatingUpdate();
  assert.equal(
    firstPage.elements.get('statusMessage').textContent,
    'No ratings changed.'
  );
  assert.equal(firstPage.elements.get('saveUpdateButton').hidden, true);

  let protectedRequestWasMade = false;
  const refreshedPage = createClient(storage, async (url, options = {}) => {
    assert.equal(url, '/api/v1/films/mine');
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    protectedRequestWasMade = true;
    return jsonResponse(200, []);
  });

  await refreshedPage.context.restorePromise;

  assert.equal(protectedRequestWasMade, true);
  assert.equal(refreshedPage.elements.get('loginForm').hidden, true);
  assert.equal(refreshedPage.elements.get('memberActions').hidden, false);
  assert.match(
    refreshedPage.elements.get('statusMessage').textContent,
    /session was restored/
  );
});

test('an expired saved token is cleared during page startup', async () => {
  const storedValues = new Map([
    [
      'movies101-session',
      JSON.stringify({ token: 'expired.jwt.token', username: 'Nimish' })
    ]
  ]);
  const storage = createStorage(storedValues);
  const page = createClient(storage, async () => {
    return jsonResponse(401, {
      error: 'The login token is invalid or expired.'
    });
  });

  await page.context.restorePromise;

  assert.equal(storage.getItem('movies101-session'), null);
  assert.equal(page.elements.get('loginForm').hidden, false);
  assert.equal(page.elements.get('memberActions').hidden, true);
  assert.match(
    page.elements.get('statusMessage').textContent,
    /Please sign in again/
  );
});

test('selected catalog movie sends its TMDB ID instead of a typed title', async () => {
  const requests = [];
  const page = createClient(createStorage(), async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/login'))
      return jsonResponse(200, { token: 'token', user: { username: 'Alice' } });
    if (url.endsWith('/films/mine')) return jsonResponse(200, []);
    if (url.endsWith('/films') && options.method === 'POST')
      return jsonResponse(201, { _id: 'saved', name: 'The Batman', rating: 8 });
    return jsonResponse(200, []);
  });
  page.elements.get('login').value = 'Alice';
  page.elements.get('loginPassword').value = 'password123';
  await page.context.testApi.login();
  page.context.testApi.selectCatalogMovie({
    id: 414906,
    title: 'The Batman',
    releaseDate: '2022-03-01'
  });
  page.elements.get('filmRating').value = '8';
  await page.context.testApi.createFilm();
  const add = requests.find(
    (request) =>
      request.options.method === 'POST' && request.url.endsWith('/films')
  );
  assert.deepEqual(JSON.parse(add.options.body), { tmdbId: 414906, rating: 8 });
  assert.equal(page.elements.get('filmTitle').value, '');
});

test('watchlist saves a verified movie without a made-up rating', async () => {
  const requests = [];
  const page = createClient(createStorage(), async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/login'))
      return jsonResponse(200, { token: 'token', user: { username: 'Alice' } });
    if (url.endsWith('/films/mine')) return jsonResponse(200, []);
    if (url.endsWith('/films') && options.method === 'POST') {
      return jsonResponse(201, {
        _id: 'saved',
        name: 'Arrival',
        watched: false
      });
    }
    return jsonResponse(200, []);
  });
  page.elements.get('login').value = 'Alice';
  page.elements.get('loginPassword').value = 'password123';
  await page.context.testApi.login();
  page.context.testApi.selectCatalogMovie({
    id: 329865,
    title: 'Arrival',
    releaseDate: '2016-11-11'
  });
  await page.context.testApi.saveSelectedToWatchlist();
  const add = requests.find(
    (request) =>
      request.options.method === 'POST' && request.url.endsWith('/films')
  );
  assert.deepEqual(JSON.parse(add.options.body), { tmdbId: 329865 });
});

test('Reel Talk sends authenticated chat history and renders the reply', async () => {
  const requests = [];
  const page = createClient(createStorage(), async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/login')) {
      return jsonResponse(200, {
        token: 'chat-token',
        user: { username: 'Alice' }
      });
    }
    if (url.endsWith('/films/mine')) return jsonResponse(200, []);
    if (url.endsWith('/assistant')) {
      return jsonResponse(200, {
        reply: 'Try Moon. Lunar isolation, zero capes.',
        recommendations: []
      });
    }
    return jsonResponse(200, []);
  });
  page.elements.get('login').value = 'Alice';
  page.elements.get('loginPassword').value = 'password123';
  await page.context.testApi.login();
  page.elements.get('assistantInput').value = 'Smart space movie?';

  await page.context.testApi.sendAssistantMessage();

  const chat = requests.find((request) => request.url.endsWith('/assistant'));
  assert.equal(chat.options.headers.Authorization, 'Bearer chat-token');
  assert.deepEqual(JSON.parse(chat.options.body), {
    messages: [{ role: 'user', content: 'Smart space movie?' }]
  });
  const renderedText = page.elements
    .get('assistantMessages')
    .children.flatMap((child) => child.children)
    .map((child) => child.textContent);
  assert.ok(renderedText.includes('Try Moon. Lunar isolation, zero capes.'));
});
