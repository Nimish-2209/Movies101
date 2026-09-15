(() => {
  const element = (id) => document.getElementById(id);
  const apiBase = (window.MOVIES101_API_BASE_URL || '/api/v1')
    .replace(/\/$/, '') + '/movies';

  let currentPage = 1;
  let currentQuery = '';
  let requestVersion = 0;
  let detailVersion = 0;
  let searchTimer = null;

  const textElement = (tag, value) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };

  const posterPlaceholder = () => {
    const node = textElement('div', 'No poster available');
    node.className = 'catalog-poster catalog-poster-placeholder';
    return node;
  };

  const createMovieActions = (movie, includeRatingAction) => {
    const actions = document.createElement('div');
    actions.className = includeRatingAction
      ? 'movie-dialog-actions'
      : 'catalog-card-actions';

    const saveButton = textElement('button', '+ Watchlist');
    saveButton.type = 'button';
    saveButton.className = includeRatingAction
      ? 'watchlist-button'
      : 'catalog-save-button';
    saveButton.addEventListener('click', () => {
      API.saveCatalogMovie(movie);
      if (includeRatingAction) element('movieDetails').close();
    });
    actions.appendChild(saveButton);

    const nextButton = textElement(
      'button',
      includeRatingAction ? 'Rate this movie' : 'Details'
    );
    nextButton.type = 'button';
    nextButton.className = includeRatingAction
      ? ''
      : 'catalog-details-button';
    nextButton.addEventListener('click', () => {
      if (includeRatingAction) {
        API.selectCatalogMovie(movie);
        element('movieDetails').close();
      } else {
        showDetails(movie.id);
      }
    });
    actions.appendChild(nextButton);
    return actions;
  };

  async function showDetails(movieId) {
    const request = ++detailVersion;
    const dialog = element('movieDetails');
    const content = element('movieDetailsContent');
    content.replaceChildren(textElement('p', 'Loading movie details…'));
    if (!dialog.open) dialog.showModal();

    try {
      const response = await fetch(apiBase + '/' + movieId, {
        signal: AbortSignal.timeout(10000)
      });
      const movie = await response.json();
      if (!response.ok) throw new Error(movie.error);
      if (request !== detailVersion) return;

      const facts = [
        movie.releaseDate,
        movie.runtime ? movie.runtime + ' minutes' : '',
        ...(movie.genres || [])
      ].filter(Boolean).join(' · ');

      content.replaceChildren(
        textElement('h2', movie.title),
        textElement('p', facts),
        textElement('p', movie.overview || 'The synopsis skipped this screening.'),
        textElement(
          'p',
          'Audience pulse: ' + Number(movie.tmdbRating || 0).toFixed(1) + '/10'
        ),
        createMovieActions(movie, true)
      );
    } catch (error) {
      if (request === detailVersion) {
        content.replaceChildren(
          textElement('p', error.message || 'Unable to load details.')
        );
      }
    }
  }

  const createMovieCard = (movie) => {
    const card = document.createElement('article');
    card.className = 'catalog-card';

    if (movie.posterUrl) {
      const image = document.createElement('img');
      image.src = movie.posterUrl;
      image.alt = movie.title + ' poster';
      image.loading = 'lazy';
      image.className = 'catalog-poster';
      image.onerror = () => image.replaceWith(posterPlaceholder());
      card.appendChild(image);
    } else {
      card.appendChild(posterPlaceholder());
    }

    const copy = document.createElement('div');
    copy.className = 'catalog-card-copy';
    copy.append(
      textElement('h3', movie.title),
      textElement(
        'p',
        movie.releaseDate.slice(0, 4) || 'Release date unknown'
      ),
      createMovieActions(movie, false)
    );
    card.appendChild(copy);
    return card;
  };

  async function loadMovies(nextPage = 1) {
    const request = ++requestVersion;
    const status = element('catalogStatus');
    const results = element('catalogResults');
    const pagination = element('catalogPagination');
    const previous = element('catalogPrevious');
    const next = element('catalogNext');

    status.textContent = 'Loading movies…';
    status.className = 'catalog-status';
    pagination.hidden = true;
    previous.disabled = true;
    next.disabled = true;

    try {
      const parameters = new URLSearchParams({
        q: currentQuery,
        page: nextPage
      });
      const response = await fetch(apiBase + '?' + parameters, {
        signal: AbortSignal.timeout(10000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (request !== requestVersion) return;

      currentPage = data.page;
      results.replaceChildren(...data.results.map(createMovieCard));
      status.textContent = data.results.length
        ? (currentQuery ? 'Search results' : 'Popular movies') +
          ' · Page ' + currentPage
        : 'No movies found. Try another title.';
      pagination.hidden = !data.results.length || data.totalPages <= 1;
      previous.disabled = currentPage <= 1;
      next.disabled = currentPage >= data.totalPages;
    } catch (error) {
      if (request !== requestVersion) return;
      results.replaceChildren();
      status.className = 'catalog-status catalog-status-error';
      status.textContent = error.message === 'Movie discovery is not configured yet.'
        ? 'The movie projector needs its data key. Your community shelf is still open below.'
        : error.message || 'The reel got tangled. Try again.';
    }
  }

  const showShortQueryMessage = () => {
    ++requestVersion;
    element('catalogResults').replaceChildren();
    element('catalogPagination').hidden = true;
    element('catalogStatus').className = 'catalog-status';
    element('catalogStatus').textContent = 'Type at least 2 characters to search.';
  };

  const searchInput = element('catalogQuery');
  const scheduleSearch = () => {
    window.clearTimeout(searchTimer);
    currentQuery = searchInput.value.trim();
    if (currentQuery.length === 1) {
      showShortQueryMessage();
      return;
    }

    ++requestVersion;
    element('catalogStatus').className = 'catalog-status';
    element('catalogStatus').textContent = currentQuery
      ? 'Searching as you type…'
      : 'Loading popular movies…';
    searchTimer = window.setTimeout(() => loadMovies(1), 350);
  };

  element('catalogSearch').addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    currentQuery = searchInput.value.trim();
    if (currentQuery.length === 1) {
      showShortQueryMessage();
    } else {
      loadMovies(1);
    }
  });
  searchInput.addEventListener('input', scheduleSearch);
  element('catalogPrevious').addEventListener(
    'click',
    () => loadMovies(currentPage - 1)
  );
  element('catalogNext').addEventListener(
    'click',
    () => loadMovies(currentPage + 1)
  );
  element('closeMovieDetails').addEventListener('click', () => {
    ++detailVersion;
    element('movieDetails').close();
  });

  loadMovies();
})();
