const API = (() => {
  const apiBaseUrl = (window.MOVIES101_API_BASE_URL || '/api/v1').replace(/\/$/, '');
  const filmsUrl = apiBaseUrl + '/films';
  const moviesUrl = apiBaseUrl + '/movies';
  const filmRatingsUrl = filmsUrl + '/ratings';
  const loginUrl = apiBaseUrl + '/login';
  const registerUrl = apiBaseUrl + '/register';
  const myFilmsUrl = filmsUrl + '/mine';
  const sessionStorageKey = 'movies101-session';

  let jwtToken = '';
  let loggedInUsername = '';
  let currentFilms = [];
  let currentView = 'community';
  let isUpdateMode = false;
  let selectedMovie = null;
  let myFilmFilter = 'all';
  let memberSearchTimer = null;
  let memberSearchController = null;
  let memberSearchVersion = 0;

  const getElement = (id) => {
    return document.getElementById(id);
  };

  const requestHeaders = ({ json = false, authenticated = false } = {}) => {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(authenticated ? { Authorization: 'Bearer ' + jwtToken } : {})
    };
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = response.status === 204 ? {} : await response.json();
    return { response, data };
  };

  const setStatus = (message, type) => {
    const statusMessage = getElement('statusMessage');
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + type;
  };

  const setTableVisible = (isVisible) => {
    getElement('filmTableSection').hidden = !isVisible;
  };

  const saveSession = () => {
    try {
      window.sessionStorage.setItem(
        sessionStorageKey,
        JSON.stringify({ token: jwtToken, username: loggedInUsername })
      );
    } catch (error) {
      console.log('Unable to save the browser session.', error);
    }
  };

  const clearSavedSession = () => {
    try {
      window.sessionStorage.removeItem(sessionStorageKey);
    } catch (error) {
      console.log('Unable to clear the browser session.', error);
    }
  };

  const getSavedSession = () => {
    try {
      const savedSession = JSON.parse(
        window.sessionStorage.getItem(sessionStorageKey) || 'null'
      );

      if (
        savedSession &&
        typeof savedSession.token === 'string' &&
        savedSession.token !== '' &&
        typeof savedSession.username === 'string' &&
        savedSession.username !== ''
      ) {
        return savedSession;
      }

      clearSavedSession();
    } catch (error) {
      clearSavedSession();
    }

    return null;
  };

  const clearTable = () => {
    getElement('filmTableBody').innerHTML = '';
  };

  const setAuthenticatedState = (username) => {
    loggedInUsername = username;

    const loginStatus = getElement('loginStatus');
    loginStatus.textContent = 'Signed in as ' + loggedInUsername;
    loginStatus.className = 'login-status authenticated';

    getElement('loginForm').hidden = true;
    getElement('logoutButton').hidden = false;
    getElement('memberActions').hidden = false;
    saveSession();
  };

  const setGuestState = () => {
    jwtToken = '';
    loggedInUsername = '';
    currentFilms = [];
    currentView = 'community';
    isUpdateMode = false;

    const loginStatus = getElement('loginStatus');
    loginStatus.textContent = 'Not signed in';
    loginStatus.className = 'login-status';

    getElement('loginForm').hidden = false;
    getElement('logoutButton').hidden = true;
    getElement('memberActions').hidden = true;
    getElement('saveUpdateButton').hidden = true;
    getElement('loginPassword').value = '';
    clearSavedSession();
    selectedMovie = null;
    getElement('filmTitle').value = '';

    clearTable();
    setTableVisible(false);
  };

  const isValidRating = (rating) => {
    const numericRating = Number(rating);
    return Number.isInteger(numericRating) && numericRating >= 0 && numericRating <= 10;
  };

  const handleAuthenticationError = (response, data) => {
    if (response.status !== 401) {
      return false;
    }

    setGuestState();
    setStatus(
      (data.error || 'Your login has expired.') + ' Please sign in again.',
      'error'
    );
    return true;
  };

  const filmMatchesFilter = (film) => {
    if (myFilmFilter === 'watchlist') return !film.watched;
    if (myFilmFilter === 'watched') return Boolean(film.watched);
    if (myFilmFilter === 'favorites') return Boolean(film.favorite);
    return true;
  };

  const createTitleCell = (film) => {
    const cell = document.createElement('td');
    cell.dataset.label = 'Movie';
    const wrap = document.createElement('div');
    wrap.className = 'shelf-title';
    if (film.posterUrl) {
      const poster = document.createElement('img');
      poster.src = film.posterUrl;
      poster.alt = '';
      poster.loading = 'lazy';
      poster.className = 'shelf-poster';
      wrap.appendChild(poster);
    }
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = film.name;
    const year = document.createElement('small');
    year.textContent = film.releaseDate ? film.releaseDate.slice(0, 4) : '';
    copy.appendChild(title);
    if (year.textContent) copy.appendChild(year);
    wrap.appendChild(copy);
    cell.appendChild(wrap);
    return cell;
  };

  const createActionButton = (label, className, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  };

  const createFilmRow = (film) => {
    const row = document.createElement('tr');

    if (isUpdateMode) {
      const titleCell = createTitleCell(film);
      const ratingCell = document.createElement('td');
      const newRatingCell = document.createElement('td');
      const newRatingInput = document.createElement('input');
      ratingCell.dataset.label = 'Current rating';
      newRatingCell.dataset.label = 'New rating';
      ratingCell.textContent = Number.isFinite(Number(film.rating))
        ? film.rating + ' / 10'
        : 'Not rated yet';
      ratingCell.className = 'rating-cell';
      newRatingInput.type = 'number';
      newRatingInput.min = '0';
      newRatingInput.max = '10';
      newRatingInput.step = '1';
      newRatingInput.placeholder = film.rating == null ? 'Give it a score' : 'Leave blank to keep';
      newRatingInput.id = 'newRating-' + film._id;
      newRatingInput.className = 'form-control table-rating-input';
      newRatingInput.dataset.filmId = film._id;
      newRatingInput.setAttribute('aria-label', 'New rating for ' + film.name);
      newRatingCell.appendChild(newRatingInput);
      row.appendChild(titleCell);
      row.appendChild(ratingCell);
      row.appendChild(newRatingCell);
      return row;
    }

    const titleCell = createTitleCell(film);
    const ratingCell = document.createElement('td');
    const isCommunityFilm = currentView === 'community';
    ratingCell.dataset.label = isCommunityFilm ? 'Average rating' : 'Your rating';
    ratingCell.textContent = film.rating == null
      ? 'Not rated'
      : Number(film.rating).toFixed(isCommunityFilm ? 1 : 0) + ' / 10';
    ratingCell.className = 'rating-cell';
    row.appendChild(titleCell);

    if (!isCommunityFilm) {
      const statusCell = document.createElement('td');
      statusCell.dataset.label = 'Status';
      statusCell.textContent = film.watched ? 'Watched 🍿' : 'Watchlist 🎬';
      statusCell.className = film.watched ? 'status-watched' : 'status-watchlist';
      row.appendChild(statusCell);
    }

    row.appendChild(ratingCell);

    if (isCommunityFilm) {
      const countCell = document.createElement('td');
      const ratingCount = Number(film.ratingCount) || 0;
      countCell.dataset.label = 'User ratings';
      countCell.textContent = ratingCount + ' critic' + (ratingCount === 1 ? '' : 's') + ' in the cheap seats';
      countCell.className = 'rating-count-cell';
      row.appendChild(countCell);
    } else {
      const actionsCell = document.createElement('td');
      actionsCell.dataset.label = 'Actions';
      actionsCell.className = 'shelf-actions';
      actionsCell.appendChild(createActionButton(
        film.favorite ? '★ Favorite' : '☆ Favorite',
        film.favorite ? 'shelf-action is-favorite' : 'shelf-action',
        () => patchFilm(film._id, {favorite: !film.favorite}, film.favorite ? 'Removed from favorites.' : 'A star is born. Added to favorites!')
      ));
      if (!film.watched) {
        actionsCell.appendChild(createActionButton(
          '✓ Watched it',
          'shelf-action',
          () => patchFilm(film._id, {watched: true}, 'Marked watched. Popcorn evidence accepted.')
        ));
      }
      actionsCell.appendChild(createActionButton(
        'Remove',
        'shelf-action shelf-remove',
        () => deleteFilm(film)
      ));
      row.appendChild(actionsCell);
    }
    return row;
  };

  const renderFilmsTable = () => {
    const body = getElement('filmTableBody');
    const header = getElement('filmTableHeaderRow');
    const filters = getElement('myFilmFilters');
    const empty = getElement('filmFilterEmpty');
    const saveButton = getElement('saveUpdateButton');
    clearTable();
    header.innerHTML = '';
    empty.hidden = true;

    if (isUpdateMode) {
      header.innerHTML = '<th>Movie</th><th>Current Rating</th><th>New Rating</th>';
      saveButton.hidden = false;
      filters.hidden = true;
    } else if (currentView === 'mine') {
      header.innerHTML = '<th>Movie</th><th>Status</th><th>Rating</th><th>Actions</th>';
      saveButton.hidden = true;
      filters.hidden = false;
    } else {
      header.innerHTML = '<th>Movie</th><th>Average Rating</th><th>User Ratings</th>';
      saveButton.hidden = true;
      filters.hidden = true;
    }

    getElement('filmListTitle').textContent = currentView === 'mine'
      ? 'My cinematic universe'
      : 'Community films';

    const visibleFilms = currentView === 'mine' && !isUpdateMode
      ? currentFilms.filter(filmMatchesFilter)
      : currentFilms;
    visibleFilms.forEach((film) => body.appendChild(createFilmRow(film)));

    if (currentView === 'mine' && !isUpdateMode && visibleFilms.length === 0) {
      empty.textContent = myFilmFilter === 'favorites'
        ? 'No favorites yet. Your stars are still waiting for their close-up.'
        : myFilmFilter === 'watchlist'
          ? 'Watchlist cleared. Either impressive or suspicious.'
          : myFilmFilter === 'watched'
            ? 'No watched movies yet. Roll something good.'
            : 'Your shelf is awaiting its opening scene.';
      empty.hidden = false;
    }

    if (filters && typeof filters.querySelectorAll === 'function') {
      filters.querySelectorAll('.film-filter').forEach((button) => {
        button.classList.toggle('active', button.dataset.filter === myFilmFilter);
      });
    }
  };

  const setMyFilmFilter = (filter) => {
    if (!['all', 'watchlist', 'watched', 'favorites'].includes(filter)) return false;
    myFilmFilter = filter;
    if (currentView === 'mine') renderFilmsTable();
    return false;
  };

  const authenticate = async (action) => {
    const usernameInput = getElement('login');
    const username = usernameInput.value.trim();
    const passwordInput = getElement('loginPassword');
    const password = passwordInput.value;

    if (username === '') {
      setStatus('Please enter a username.', 'error');
      return false;
    }

    if (password.length < 8 || password.length > 128) {
      setStatus('Password must contain 8 to 128 characters.', 'error');
      return false;
    }

    try {
      const { response, data } = await fetchJson(action === 'register' ? registerUrl : loginUrl, {
        method: 'POST',
        body: JSON.stringify({ username: username, password: password }),
        headers: requestHeaders({ json: true })
      });

      if (!response.ok || !data.token) {
        setStatus(
          data.error || (action === 'register'
            ? 'Unable to sign up right now.'
            : 'Unable to log in right now.'),
          'error'
        );
        return false;
      }

      jwtToken = data.token;
      const authenticatedUsername = data.user && data.user.username
        ? data.user.username
        : username;
      setAuthenticatedState(authenticatedUsername);
      usernameInput.value = '';
      passwordInput.value = '';

      setStatus(
        action === 'register'
          ? 'Account created. Signed in as ' + authenticatedUsername + '.'
          : 'Logged in successfully as ' + authenticatedUsername + '.',
        'success'
      );
      await getMyFilms(false);
    } catch (error) {
      console.log(error);
      setStatus(
        action === 'register'
          ? 'Unable to sign up right now.'
          : 'Unable to log in right now.',
        'error'
      );
    }

    return false;
  };

  const login = () => {
    return authenticate('login');
  };

  const register = () => {
    return authenticate('register');
  };

  const logout = () => {
    setGuestState();
    setStatus('Signed out. Guest browsing is still available.', 'notice');
    getElement('login').focus();
    return false;
  };

  const clearMemberMovieResults = () => {
    const results = getElement('memberMovieResults');
    results.innerHTML = '';
    results.hidden = true;
    getElement('filmTitle').setAttribute('aria-expanded', 'false');
  };

  const memberPosterPlaceholder = () => {
    const placeholder = document.createElement('span');
    placeholder.className = 'member-result-poster member-result-poster-empty';
    placeholder.textContent = 'No image';
    return placeholder;
  };

  const renderMemberMovieResults = (movies) => {
    const results = getElement('memberMovieResults');
    results.innerHTML = '';

    if (movies.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'member-result-empty';
      empty.textContent = 'No matching movies found.';
      results.appendChild(empty);
    } else {
      movies.slice(0, 8).forEach((movie) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'member-movie-option';
        option.setAttribute('role', 'option');

        if (movie.posterUrl) {
          const poster = document.createElement('img');
          poster.className = 'member-result-poster';
          poster.src = movie.posterUrl;
          poster.alt = '';
          poster.loading = 'lazy';
          poster.onerror = () => poster.replaceWith(memberPosterPlaceholder());
          option.appendChild(poster);
        } else {
          option.appendChild(memberPosterPlaceholder());
        }

        const copy = document.createElement('span');
        copy.className = 'member-result-copy';
        const title = document.createElement('strong');
        title.textContent = movie.title;
        const year = document.createElement('small');
        year.textContent = movie.releaseDate
          ? movie.releaseDate.slice(0, 4)
          : 'Release year unknown';
        copy.appendChild(title);
        copy.appendChild(year);
        option.appendChild(copy);
        option.addEventListener('click', () => selectCatalogMovie(movie));
        results.appendChild(option);
      });
    }

    results.hidden = false;
    getElement('filmTitle').setAttribute('aria-expanded', 'true');
  };

  const searchMemberMovies = async (query) => {
    const normalizedQuery = query.trim();
    const requestVersion = ++memberSearchVersion;

    if (memberSearchController) {
      memberSearchController.abort();
    }
    if (normalizedQuery.length < 2) {
      clearMemberMovieResults();
      return false;
    }

    memberSearchController = new AbortController();
    const results = getElement('memberMovieResults');
    results.innerHTML = '<p class="member-result-empty">Searching movies…</p>';
    results.hidden = false;
    getElement('filmTitle').setAttribute('aria-expanded', 'true');

    try {
      const { response, data } = await fetchJson(
        moviesUrl + '?' + new URLSearchParams({q: normalizedQuery, page: 1}),
        {signal: memberSearchController.signal}
      );
      if (!response.ok) {
        throw new Error(data.error || 'Unable to search movies.');
      }
      if (requestVersion !== memberSearchVersion) {
        return false;
      }
      renderMemberMovieResults(Array.isArray(data.results) ? data.results : []);
      return true;
    } catch (error) {
      if (error.name === 'AbortError' || requestVersion !== memberSearchVersion) {
        return false;
      }
      results.innerHTML = '';
      const message = document.createElement('p');
      message.className = 'member-result-empty member-result-error';
      message.textContent = error.message || 'Unable to search movies.';
      results.appendChild(message);
      results.hidden = false;
      return false;
    }
  };

  const selectCatalogMovie = (movie) => {
    selectedMovie = {id: movie.id, title: movie.title, releaseDate: movie.releaseDate || ''};
    getElement('filmTitle').value = movie.title + (movie.releaseDate ? ' (' + movie.releaseDate.slice(0, 4) + ')' : '');
    clearMemberMovieResults();
    if (jwtToken) {
      getElement('memberActions').scrollIntoView?.({behavior: 'smooth'});
      getElement('filmRating').focus();
      setStatus('Selected ' + movie.title + '. Add your rating below.', 'notice');
    } else {
      getElement('loginForm').scrollIntoView?.({behavior: 'smooth'});
      setStatus('Selected ' + movie.title + '. Sign in to rate it.', 'notice');
    }
  };

  const postSelectedMovie = async (rating) => {
    if (jwtToken === '') {
      setStatus('Sign in first—the velvet rope is up.', 'error');
      getElement('loginForm').scrollIntoView?.({behavior: 'smooth'});
      return false;
    }
    if (!selectedMovie || !Number.isSafeInteger(selectedMovie.id)) {
      setStatus('Pick a real movie first. Imaginary sequels do not count.', 'error');
      return false;
    }
    const title = selectedMovie.title;
    const payload = {tmdbId: selectedMovie.id};
    if (rating !== undefined) payload.rating = rating;
    try {
      const { response, data } = await fetchJson(filmsUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: requestHeaders({ json: true, authenticated: true })
      });
      if (!response.ok) {
        if (handleAuthenticationError(response, data)) return false;
        setStatus(data.error || 'The projector jammed. Try again.', 'error');
        return false;
      }
      selectedMovie = null;
      getElement('filmTitle').value = '';
      getElement('filmRating').value = '';
      await getMyFilms(false);
      setStatus(
        rating === undefined
          ? '“' + title + '” joined your watchlist. Future-you has plans.'
          : '“' + title + '” rated ' + rating + '/10. Bold take!',
        'success'
      );
      getElement('filmTitle').focus();
      return true;
    } catch (error) {
      console.log(error);
      setStatus('The projector jammed. Try again.', 'error');
      return false;
    }
  };

  const saveSelectedToWatchlist = () => postSelectedMovie(undefined);

  const saveCatalogMovie = (movie) => {
    selectCatalogMovie(movie);
    return saveSelectedToWatchlist();
  };

  const createFilm = async () => {
    const ratingValue = getElement('filmRating').value.trim();
    if (ratingValue === '') {
      setStatus('Drop a rating from 0 to 10—or use + Watchlist.', 'error');
      return false;
    }
    if (!isValidRating(ratingValue)) {
      setStatus('Ratings live between 0 and 10. Even cult classics.', 'error');
      return false;
    }
    await postSelectedMovie(Number(ratingValue));
    return false;
  };

  const patchFilm = async (filmId, changes, successMessage) => {
    try {
      const { response, data } = await fetchJson(filmsUrl + '/' + filmId, {
        method: 'PATCH',
        body: JSON.stringify(changes),
        headers: requestHeaders({ json: true, authenticated: true })
      });
      if (!response.ok) {
        if (handleAuthenticationError(response, data)) return false;
        setStatus(data.error || 'Could not update that movie.', 'error');
        return false;
      }
      currentFilms = currentFilms.map((film) => film._id === data._id ? data : film);
      renderFilmsTable();
      setStatus(successMessage, 'success');
      return true;
    } catch (error) {
      setStatus('Could not update that movie.', 'error');
      return false;
    }
  };

  const deleteFilm = async (film) => {
    if (typeof window.confirm === 'function' && !window.confirm('Remove “' + film.name + '” from your shelf?')) {
      return false;
    }
    try {
      const { response, data } = await fetchJson(filmsUrl + '/' + film._id, {
        method: 'DELETE',
        headers: requestHeaders({ authenticated: true })
      });
      if (!response.ok) {
        if (handleAuthenticationError(response, data)) return false;
        setStatus(data.error || 'Could not remove that movie.', 'error');
        return false;
      }
      currentFilms = currentFilms.filter((item) => item._id !== film._id);
      if (currentFilms.length === 0) {
        setTableVisible(false);
      } else {
        renderFilmsTable();
      }
      setStatus('“' + film.name + '” left the building.', 'success');
      return true;
    } catch (error) {
      setStatus('Could not remove that movie.', 'error');
      return false;
    }
  };

  const enterUpdateMode = async () => {
    if (jwtToken === '') {
      setStatus('Please log in to update films.', 'error');
      return false;
    }

    const loaded = await getMyFilms(false);

    if (!loaded || currentFilms.length === 0) {
      setStatus('Add a film before updating a rating.', 'notice');
      return false;
    }

    isUpdateMode = true;
    renderFilmsTable();
    setStatus(
      'Enter new ratings for any films you want to change, then save.',
      'notice'
    );
    return false;
  };

  const saveRatingUpdate = async () => {
    if (jwtToken === '') {
      setStatus('Please log in to update films.', 'error');
      return false;
    }

    const ratingInputs = Array.from(
      document.querySelectorAll('.table-rating-input')
    );
    const updates = [];

    for (const ratingInput of ratingInputs) {
      const rating = ratingInput.value.trim();

      if (rating === '') {
        continue;
      }

      const film = currentFilms.find(
        (item) => item._id === ratingInput.dataset.filmId
      );

      if (!film || !isValidRating(rating)) {
        const filmName = film ? ' for "' + film.name + '"' : '';
        setStatus(
          'Please enter a whole number from 0 to 10' + filmName + '.',
          'error'
        );
        ratingInput.focus();
        return false;
      }

      updates.push({
        id: film._id,
        rating: Number(rating)
      });
    }

    if (updates.length === 0) {
      isUpdateMode = false;
      renderFilmsTable();
      setStatus('No ratings changed.', 'notice');
      return false;
    }

    const saveUpdateButton = getElement('saveUpdateButton');
    saveUpdateButton.disabled = true;
    saveUpdateButton.textContent = 'Saving...';

    try {
      const { response, data } = await fetchJson(filmRatingsUrl, {
        method: 'PUT',
        body: JSON.stringify({ updates: updates }),
        headers: requestHeaders({ json: true, authenticated: true })
      });

      if (!response.ok) {
        if (handleAuthenticationError(response, data)) {
          return false;
        }
        setStatus(
          data.error || 'Unable to save the rating updates right now.',
          'error'
        );
        return false;
      }

      isUpdateMode = false;
      const refreshed = await getMyFilms(false);

      if (refreshed) {
        setStatus(
          'Updated ' + updates.length + ' film rating' +
          (updates.length === 1 ? '.' : 's.'),
          'success'
        );
      }
    } catch (error) {
      console.log(error);
      setStatus('Unable to save the rating updates right now.', 'error');
    } finally {
      saveUpdateButton.disabled = false;
      saveUpdateButton.textContent = 'Save Update';
    }

    return false;
  };

  const fetchFilmCollection = async (url, view, showStatus) => {
    try {
      const { response, data } = await fetchJson(url, {
        method: 'GET',
        headers: requestHeaders({ authenticated: view === 'mine' })
      });

      if (!response.ok) {
        if (handleAuthenticationError(response, data)) {
          return false;
        }
        setStatus(data.error || 'Unable to get films right now.', 'error');
        return false;
      }

      currentFilms = data;
      currentView = view;
      isUpdateMode = false;

      if (currentFilms.length === 0) {
        clearTable();
        getElement('myFilmFilters').hidden = true;
        getElement('filmFilterEmpty').hidden = true;
        setTableVisible(false);

        if (showStatus) {
          setStatus(
            view === 'mine'
              ? 'You have not added any films yet.'
              : 'No community films have been added yet.',
            'notice'
          );
        }

        return true;
      }

      renderFilmsTable();
      setTableVisible(true);

      if (showStatus) {
        const label = view === 'mine' ? 'your film' : 'community film';
        setStatus(
          'Showing ' + currentFilms.length + ' ' + label +
          (currentFilms.length === 1 ? '.' : 's.'),
          'success'
        );
      }

      return true;
    } catch (error) {
      console.log(error);
      setTableVisible(false);
      setStatus('Unable to get films right now.', 'error');
      return false;
    }
  };

  const getFilms = async (showStatus = true) => {
    return fetchFilmCollection(filmsUrl, 'community', showStatus);
  };

  const getMyFilms = async (showStatus = true) => {
    if (jwtToken === '') {
      setStatus('Please log in to view your films.', 'error');
      return false;
    }

    return fetchFilmCollection(myFilmsUrl, 'mine', showStatus);
  };

  const restoreSession = async () => {
    const savedSession = getSavedSession();

    if (!savedSession) {
      return false;
    }

    jwtToken = savedSession.token;
    setAuthenticatedState(savedSession.username);
    setStatus('Restoring your signed-in session...', 'notice');

    const restored = await getMyFilms(false);

    if (restored && jwtToken !== '') {
      setStatus(
        'Welcome back, ' + loggedInUsername + '. Your session was restored.',
        'success'
      );
      return true;
    }

    return false;
  };

  const initializeMemberMovieSearch = () => {
    const input = getElement('filmTitle');
    if (!input || typeof input.addEventListener !== 'function') {
      return;
    }
    input.addEventListener('input', () => {
      selectedMovie = null;
      window.clearTimeout(memberSearchTimer);
      memberSearchTimer = window.setTimeout(
        () => searchMemberMovies(input.value),
        300
      );
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        clearMemberMovieResults();
      }
    });

    const field = input.closest('.member-movie-field');
    if (field) {
      field.addEventListener('focusout', (event) => {
        if (event.relatedTarget && !field.contains(event.relatedTarget)) {
          clearMemberMovieResults();
        }
      });
    }

    if (typeof document.addEventListener === 'function') {
      document.addEventListener('click', (event) => {
        if (field && !field.contains(event.target)) {
          clearMemberMovieResults();
        }
      });
    }
  };

  initializeMemberMovieSearch();

  return {
    restoreSession: restoreSession,
    login: login,
    register: register,
    logout: logout,
    createFilm: createFilm,
    saveSelectedToWatchlist: saveSelectedToWatchlist,
    saveCatalogMovie: saveCatalogMovie,
    setMyFilmFilter: setMyFilmFilter,
    selectCatalogMovie: selectCatalogMovie,
    searchMemberMovies: searchMemberMovies,
    getFilms: getFilms,
    getMyFilms: getMyFilms,
    enterUpdateMode: enterUpdateMode,
    saveRatingUpdate: saveRatingUpdate
  };
})();

API.restoreSession();
