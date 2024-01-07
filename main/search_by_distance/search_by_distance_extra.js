﻿'use strict';
//07/01/24

/* exported calculateSimilarArtistsFromPls, writeSimilarArtistsTags, getArtistsSameZone, getZoneArtistFilter, getZoneGraphFilter, findStyleGenresMissingGraph */

include('search_by_distance.js');
/* global sbd:readable, searchByDistance:readable, music_graph_descriptors_user:readable */
/* global getTagsValuesV3:readable, getTagsValuesV4:readable, globTags:readable, _p:readable, removeDuplicatesV2:readable, globQuery:readable, clone:readable, _q:readable, queryCombinations:readable, queryJoin:readable, round:readable, folders:readable, WshShell:readable, round:readable, round:readable, round:readable, popup:readable, _isFile:readable, _save:readable, _jsonParseFile:readable, utf8:readable, _deleteFile:readable, _b:readable, musicGraph:readable, calcMeanDistanceV2:readable, music_graph_descriptors:readable, secondsToTime:readable, _jsonParseFileCheck:readable, isArray:readable, secondsToTime:readable, _bt:readable, isString:readable, _asciify:readable, _qCond:readable, isInt:readable */
include('..\\music_graph\\music_graph_descriptors_xxx_countries.js');
/* global music_graph_descriptors_countries:readable */
include('..\\music_graph\\music_graph_descriptors_xxx_culture.js');
/* global music_graph_descriptors_culture:readable */
include('..\\music_graph\\music_graph_descriptors_xxx_node.js');
include('..\\world_map\\world_map_tables.js');
/* global getCountryISO:readable, isoMapRev:readable , nameReplacersRev:readable */

// Similar artists
async function calculateSimilarArtists({ selHandle = fb.GetFocusItem(), properties = null, theme = null, recipe = 'int_simil_artists_calc_graph.json', dateRange = 10, size = 50, method = 'weighted' } = {}) {
	const test = sbd.panelProperties.bProfile[1] ? new FbProfiler('calculateSimilarArtists') : null;
	// Retrieve all tracks for the selected artist and compare them against the library (any other track not by the artist)
	const artist = getTagsValuesV3(new FbMetadbHandleList(selHandle), [globTags.artist], true).flat().filter(Boolean);
	const libQuery = artist.map((tag) => { return _p(globTags.artist + ' IS ' + tag); }).join(' AND ');
	// Retrieve artist's tracks and remove duplicates
	let selArtistTracks = fb.GetQueryItems(fb.GetLibraryItems(), libQuery);
	selArtistTracks = removeDuplicatesV2({ handleList: selArtistTracks, sortBias: globQuery.remDuplBias, bPreserveSort: false, bAdvTitle: true });
	// Use only X random tracks instead of all of them
	const report = new Map();
	const randomSelTracks = selArtistTracks.Convert().shuffle().slice(0, size);
	const newConfig = clone(properties);
	const tags = JSON.parse(newConfig.tags[1]);
	const genreStyleTag = Object.values(tags).filter((t) => t.type.includes('graph') && !t.type.includes('virtual')).map((t) => t.tf).flat(Infinity).filter(Boolean);
	const genreStyleTagQuery = genreStyleTag.map((tag) => { return tag.indexOf('$') === -1 ? tag : _q(tag); });
	// Find which genre/styles are nearest as pre-filter using the selected track
	let forcedQuery = '';
	if (method === 'reference') {
		const genreStyle = getTagsValuesV3(new FbMetadbHandleList(selHandle), genreStyleTag, true).flat().filter(Boolean);
		const allowedGenres = getNearestGenreStyles(genreStyle, 50, sbd.allMusicGraph);
		const allowedGenresQuery = queryCombinations(allowedGenres, genreStyleTagQuery, 'OR', 'AND');
		forcedQuery = _p(artist.map((tag) => { return _p('NOT ' + globTags.artist + ' IS ' + tag); }).join(' AND ')) + (allowedGenresQuery.length ? ' AND ' + _p(allowedGenresQuery) : '');
	}
	// Weight with all artist's tracks
	const genreStyleWeight = new Map();
	let weight = 1;
	if (method === 'weighted') {
		const genreStyle = getTagsValuesV3(selArtistTracks, genreStyleTag, true).flat(Infinity).filter(Boolean);
		const size = genreStyle.length;
		genreStyle.forEach((val) => {
			if (genreStyleWeight.has(val)) { genreStyleWeight.set(val, genreStyleWeight.get(val) + 1); }
			else { genreStyleWeight.set(val, 1); }
		});
		genreStyleWeight.forEach((val, key) => { genreStyleWeight.set(key, val / size); });
	}
	// Add all possible exclusions to make it faster (even if it less precise)
	// newConfig.genreStyleFilter[1] = [...(clone(music_graph_descriptors.map_distance_exclusions).union(new Set(newConfig.genreStyleFilter[1].split(/| */))))].join(',');
	if (sbd.panelProperties.bProfile[1]) { test.Print('Task #1: Retrieve artists\' track', false); }
	for await (const sel of randomSelTracks) {
		// Find which genre/styles are nearest as pre-filter with randomly chosen tracks
		if (method === 'variable' || method === 'weighted') {
			const genreStyle = getTagsValuesV3(new FbMetadbHandleList(sel), genreStyleTag, true).flat().filter(Boolean);
			const allowedGenres = getNearestGenreStyles(genreStyle, 50, sbd.allMusicGraph);
			const allowedGenresQuery = queryJoin(queryCombinations(allowedGenres, genreStyleTagQuery, 'OR'), 'OR');
			forcedQuery = _p(artist.map((tag) => { return _p('NOT ' + globTags.artist + ' IS ' + tag); }).join(' AND ')) + (allowedGenresQuery.length ? ' AND ' + _p(allowedGenresQuery) : '');
			if (method === 'weighted') { // Weight will be <= 1 according to how representative of the artist's works is
				weight = [...new Set(genreStyle)].reduce((total, val) => { return total + (genreStyleWeight.has(val) ? genreStyleWeight.get(val) : 0); }, 0);
			}
		}
		// Further filter the tracks using a date range
		let dateQuery = '';
		if (Number.isFinite(dateRange)) {
			const dateTag = tags.date.tf[0];
			if (dateTag) {
				const dateQueryTag = dateTag.indexOf('$') !== -1 ? _q(dateTag) : dateTag;
				const date = getTagsValuesV4(new FbMetadbHandleList(sel), [dateTag], true).flat().filter(Boolean)[0];
				dateQuery = date && date.length ? _p(dateQueryTag + ' GREATER ' + (Number(date) - Math.floor(dateRange / 2)) + ' AND ' + dateQueryTag + ' LESS ' + (Number(date) + Math.floor(dateRange / 2))) : null;
			}
		}
		// Compare by genre/style and date using graph method. Exclude anti-influences (faster). All config found on the recipe file
		const data = await searchByDistance({
			properties: newConfig,
			panelProperties: sbd.panelProperties,
			sel, theme, recipe,
			// --->Pre-Scoring Filters
			forcedQuery: dateQuery ? forcedQuery + ' AND ' + dateQuery : forcedQuery
		});
		const [selectedHandlesArray, selectedHandlesData,] = data || [[], []];
		// Group tracks per artist and sum their score
		const similArtist = getTagsValuesV3(new FbMetadbHandleList(selectedHandlesArray), [globTags.artist], true);
		const similArtistData = new Map();
		let totalScore = 0;
		const totalCount = selectedHandlesArray.length;
		similArtist.forEach((handleArtist, i) => {
			handleArtist.filter(Boolean).forEach((artist) => {
				if (similArtistData.has(artist)) {
					const data = similArtistData.get(artist);
					data.count++;
					data.score += selectedHandlesData[i].score;
					similArtistData.set(artist, data);
				} else { similArtistData.set(artist, { artist, count: 1, score: selectedHandlesData[i].score }); }
				totalScore++;
			});
		});
		// Add artist's score to global list
		for (const [, value] of similArtistData) {
			const count = value.count / totalCount * weight;
			const score = value.score / totalScore * weight;
			const artist = value.artist.toString(); // To avoid weird things with different key objects
			if (report.has(artist)) {
				const data = report.get(artist);
				data.count += count;
				data.score += score;
				report.set(artist, data);
			} else { report.set(artist, { artist, count, score }); }
		}
	}
	if (sbd.panelProperties.bProfile[1]) { test.Print('Task #2: Retrieve scores', false); }
	// Get all matched artists and sort by score
	let total = [];
	for (const [, value] of report) {
		const count = round(value.count / size * 100, 1);
		if (count > 1) {
			const score = round(value.score / size, 2);
			const scoreW = round(value.score / value.count, 1);
			total.push({ artist: value.artist, score, count, scoreW });
		}
	}
	total.sort((a, b) => { return b.scoreW - a.scoreW; });
	return { artist: artist.join(', '), val: total };
}

async function calculateSimilarArtistsFromPls({ items = plman.GetPlaylistSelectedItems(plman.ActivePlaylist), file = folders.data + 'searchByDistance_artists.json', iNum = 10, tagName = 'SIMILAR ARTISTS SEARCHBYDISTANCE', properties } = {}) {
	const handleList = removeDuplicatesV2({ handleList: items, sortOutput: globTags.artist, checkKeys: [globTags.artist] });
	const time = secondsToTime(Math.round(handleList.Count * 30 * fb.GetLibraryItems().Count / 70000));
	if (WshShell.Popup('Process [diferent] artists from currently selected items and calculate their most similar artists?\nResults are output to console and saved to JSON:\n' + file + '\n\nEstimated time: <= ' + time, 0, 'Search by Distance', popup.question + popup.yes_no) === popup.no) { return; }
	let profiler = new FbProfiler('Calculate similar artists');
	const newData = [];
	const handleArr = handleList.Convert();
	for await (const selHandle of handleArr) {
		const output = await calculateSimilarArtists({ properties, selHandle });
		if (output.val.length) { newData.push(output); }
	}
	if (!newData.length) { console.log('Nothing found.'); return []; }
	if (!_isFile(file)) {
		newData.forEach((obj) => { console.log(obj.artist + ' --> ' + JSON.stringify(obj.val.slice(0, iNum))); }); // DEBUG
		_save(file, JSON.stringify(newData, null, '\t'));
	} else {
		const data = _jsonParseFile(file, utf8);
		if (data) {
			const idxMap = new Map();
			data.forEach((obj, idx) => { idxMap.set(obj.artist, idx); });
			newData.forEach((obj) => {
				const idx = idxMap.get(obj.artist);
				if (idx >= 0) { data[idx] = obj; }
				else { data.push(obj); }
				console.log(obj.artist + ' --> ' + JSON.stringify(obj.val.slice(0, iNum))); // DEBUG
			});
		}
		_deleteFile(file);
		_save(file, JSON.stringify(data || newData, null, '\t'));
	}
	profiler.Print();
	const report = newData.map((obj) => // List of artists with tabbed similar artists + score
		obj.artist + ':\n\t' + (obj.val.map((sim) =>
			_b(sim.scoreW) + '\t' + sim.artist
		).join('\n\t') || '-NONE-')
	).join('\n\n');
	fb.ShowPopupMessage(report, 'Search by distance');
	if (WshShell.Popup('Write similar artist tags to all tracks by selected artists?\n(It will also rewrite previously added similar artist tags)\nOnly first ' + iNum + ' artists with highest score will be used.', 0, 'Similar artists', popup.question + popup.yes_no) === popup.no) { return; }
	else {
		newData.forEach((obj) => {
			const artist = obj.artist.split(', ');
			const similarArtists = obj.val.map((o) => { return o.artist; }).slice(0, iNum);
			if (!similarArtists.length) { return; }
			const artistTracks = fb.GetQueryItems(fb.GetLibraryItems(), artist.map((a) => { return globTags.artist + ' IS ' + a; }).join(' OR '));
			const count = artistTracks.Count;
			if (count) {
				let arr = [];
				for (let i = 0; i < count; ++i) {
					arr.push({
						[tagName]: similarArtists
					});
				}
				artistTracks.UpdateFileInfoFromJSON(JSON.stringify(arr));
				console.log('Updating tracks by ' + artist + ': ' + count + ' tracks.');
			}
		});
	}
	return newData;
}

function writeSimilarArtistsTags({ file = folders.data + 'searchByDistance_artists.json', iNum = 10, tagName = 'SIMILAR ARTISTS SEARCHBYDISTANCE' } = {}) {
	if (WshShell.Popup('Write similar artist tags from JSON database to files?\nOnly first ' + iNum + ' artists with highest score will be used.', 0, window.Name, popup.question + popup.yes_no) === popup.no) { return false; }
	if (!_isFile(file)) { return false; }
	else {
		const data = _jsonParseFile(file, utf8);
		if (data) {
			const bRewrite = WshShell.Popup('Rewrite previously added similar artist tags?', 0, window.Name, popup.question + popup.yes_no) === popup.yes;
			const queryNoRw = ' AND ' + tagName + ' MISSING';
			data.forEach((obj) => {
				const artist = obj.artist.split(', ');
				const similarArtists = obj.val.map((o) => { return o.artist; }).slice(0, iNum);
				if (!similarArtists.length) { return; }
				const queryArtists = artist.map((a) => { return globTags.artist + ' IS ' + a; }).join(' OR ');
				const artistTracks = fb.GetQueryItems(fb.GetLibraryItems(), (bRewrite ? queryArtists : _p(queryArtists) + queryNoRw));
				const count = artistTracks.Count;
				if (count) {
					let arr = [];
					for (let i = 0; i < count; ++i) {
						arr.push({
							[tagName]: similarArtists
						});
					}
					artistTracks.UpdateFileInfoFromJSON(JSON.stringify(arr));
					console.log('Updating tracks by ' + artist + ': ' + count + ' tracks.');
				}
			});
		}
	}
	return true;
}

// Similar genre/styles
function getNearestNodes(fromNode, maxDistance, graph = musicGraph()) {
	const nodeList = [];
	const nodeListSet = new Set([fromNode]);
	let remaining = graph.getLinks(fromNode);
	if (remaining) {
		while (remaining.length) {
			let distance = Infinity;
			let toAdd = [];
			remaining.forEach((link) => {
				const toId = nodeListSet.has(link.fromId) ? (nodeListSet.has(link.toId) ? null : link.toId) : link.fromId;
				if (toId) {
					distance = calcMeanDistanceV2(graph, [fromNode], [toId]);
					if (distance <= maxDistance) {
						nodeList.push({ toId, distance });
						nodeListSet.add(toId);
						toAdd = toAdd.concat(graph.getLinks(toId));
					}
				}
			});
			remaining = toAdd;
		}
	}
	return nodeList;
}

function getNearestGenreStyles(fromGenreStyles, maxDistance, graph = musicGraph()) {
	let genreStyles = [...fromGenreStyles]; // Include theirselves
	fromGenreStyles.forEach((node) => { getNearestNodes(node, maxDistance, graph).forEach((obj) => { genreStyles.push(obj.toId); }); });
	genreStyles = music_graph_descriptors.replaceWithSubstitutionsReverse([...new Set(genreStyles)]);
	genreStyles = [...(new Set(genreStyles.filter((node) => { return !node.match(/_supercluster$|_cluster$|_supergenre$| XL$/gi); })))];
	return genreStyles;
}

/* function getIsoFromHandle (handle, worldMapData = null) {
	let iso = '';
	const tagName = globTags.locale;
	const localeTag = fb.TitleFormat(_bt(tagName)).EvalWithMetadb(handle).split(', ').filter(Boolean).pop() || '';
	if (localeTag.length) {iso = getCountryISO(localeTag) || '';}
	else {
		const artist = fb.TitleFormat(globTags.artist).EvalWithMetadb(handle);
		{iso, worldMapData} = getLocaleFromId(artist, worldMapData);
	}
	return {iso, worldMapData};
} */

// Similar culture zone
function getLocaleFromId(id, worldMapData = null) {
	const output = { locale: [''], country: '', iso: '', worldMapData: null };
	const dataId = 'artist';
	const path = (_isFile(fb.FoobarPath + 'portable_mode_enabled') ? '.\\profile\\' + folders.dataName : folders.data) + 'worldMap.json';
	if (!worldMapData && _isFile(path)) {
		const data = _jsonParseFileCheck(path, 'Tags json', window.Name, utf8);
		if (data) { worldMapData = data; }
	}
	if (!worldMapData) { console.log('getZoneArtistFilter: no world map data available'); return output; }
	// Retrieve current country
	if (isArray(id)) { return id.map((_) => { return getLocaleFromId(_, worldMapData); }); }
	else {
		output.locale = (worldMapData.find((obj) => { return (obj[dataId] === id); }) || {}).val || [''];
		output.country = output.locale.length ? (output.locale.slice(-1)[0] || '') : '';
		output.iso = output.country.length ? (getCountryISO(output.country) || '') : '';
		output.worldMapData = worldMapData;
		return output;
	}
}

// Similar culture zone
function getArtistsSameZone({ selHandle = fb.GetFocusItem() } = {}) {
	const test = sbd.panelProperties.bProfile[1] ? new FbProfiler('getArtistsSameZone') : null;
	// Retrieve artist
	const dataId = 'artist';
	const selId = fb.TitleFormat(_bt(dataId)).EvalWithMetadb(selHandle);
	if (sbd.panelProperties.bProfile[1]) { test.Print('Task #1: Retrieve artists\' track', false); }
	// Retrieve world map data
	const { iso: selIso, worldMapData } = getLocaleFromId(selId);
	if (sbd.panelProperties.bProfile[1]) { test.Print('Task #3: Retrieve current country', false); }
	const allowCountryName = new Set();
	if (selIso.length) {
		// Retrieve current region
		const selRegion = music_graph_descriptors_countries.getFirstNodeRegion(selIso);
		if (sbd.panelProperties.bProfile[1]) { test.Print('Task #4: Retrieve current region', false); }
		// Set allowed countries from current region
		const allowCountryISO = music_graph_descriptors_countries.getNodesFromRegion(selRegion).flat(Infinity);
		allowCountryISO.forEach((iso) => {
			const name = isoMapRev.get(iso);
			if (name) { allowCountryName.add(name.toLowerCase()); }
		});
		allowCountryName.forEach((name) => { // Add alternate names
			if (nameReplacersRev.has(name)) { allowCountryName.add(nameReplacersRev.get(name)); }
		});
		if (sbd.panelProperties.bProfile[1]) { test.Print('Task #5: Retrieve allowed countries from current region', false); }
	}
	// Compare and get list of allowed artists
	const artists = [];
	if (allowCountryName.size !== 0) {
		worldMapData.forEach((item) => {
			const country = item.val.length ? item.val.slice(-1)[0].toLowerCase() : null;
			if (country && allowCountryName.has(country)) { artists.push(item[dataId]); }
		});
	}
	console.log(artists);
	if (sbd.panelProperties.bProfile[1]) { test.Print('Task #6: Compare and get list of allowed artists', false); }
	return artists;
}

function getCountriesFromISO(iso, mode) {
	const keys = ['continent', 'region', 'country', 'no-continent', 'no-region', 'no-country'];
	mode = isInt(mode)
		? keys[mode] || ''
		: mode ? mode.toLowerCase() : '';
	console.log(mode);
	// Retrieve current region
	const selRegion = music_graph_descriptors_countries.getFirstNodeRegion(iso);
	// Set allowed countries from current region
	let filterNodes = [];
	let oppositeNodes = [];
	switch (mode) {
		case 'continent':
		case 'no-continent': {
			const selMainRegion = music_graph_descriptors_countries.getMainRegion(selRegion);
			filterNodes = music_graph_descriptors_countries.getNodesFromRegion(selMainRegion).flat(Infinity);
			oppositeNodes =  [...new Set(music_graph_descriptors_countries.getNodes()).difference(new Set(filterNodes))];
			break;
		}
		case 'region':
		case 'no-region': {
			filterNodes = music_graph_descriptors_countries.getNodesFromRegion(selRegion).flat(Infinity);
			oppositeNodes = [...new Set(music_graph_descriptors_countries.getNodes()).difference(new Set(filterNodes))];
			break;
		}
		case 'country':
		case 'no-country': {
			filterNodes = [iso];
			oppositeNodes = [...new Set(music_graph_descriptors_countries.getNodes()).difference(new Set(filterNodes))];
			break;
		}
		default: {
			filterNodes = music_graph_descriptors_countries.getNodes();
		}
	}
	return mode.startsWith('no-')
		? [oppositeNodes, filterNodes]
		: [filterNodes , oppositeNodes];
}

// TODO test
function getZoneArtistFilter(iso, mode = 'region', worldMapData = null, localeTag = globTags.locale) {
	// Retrieve artist
	const dataId = 'artist';
	// Retrieve world map data
	const path = (_isFile(fb.FoobarPath + 'portable_mode_enabled') ? '.\\profile\\' + folders.dataName : folders.data) + 'worldMap.json';
	if (!worldMapData && _isFile(path)) {
		const data = _jsonParseFileCheck(path, 'Tags json', window.Name, utf8);
		if (data) { worldMapData = data; }
	}
	if (!worldMapData) { console.log('getZoneArtistFilter: no world map data available'); return; }
	// Set allowed countries from current region
	const [countryISO, noCountryISO] = getCountriesFromISO(iso, mode);
	const countryName = new Set(countryISO.map((iso) => { return isoMapRev.get(iso).toLowerCase(); }).filter(Boolean));
	countryName.forEach((name) => { if (nameReplacersRev.has(name)) { countryName.add(nameReplacersRev.get(name)); } }); // Add alternate names
	// Compare and get list of allowed artists
	const artists = [];
	worldMapData.forEach((item) => {
		const country = item.val.length ? item.val.slice(-1)[0].toLowerCase() : null;
		if (country && countryName.has(country)) { artists.push(item[dataId]); }
	});
	// Query
	let query = [];
	query.push(queryJoin(artists.map((artist) => globTags.artist + ' IS ' + artist), 'OR'));
	// Compare if negating countries is smaller than the opposite list, which should be faster for queries
	if (noCountryISO.length < countryISO.length) {
		const noCountryName = new Set(noCountryISO.map((iso) => { return isoMapRev.get(iso).toLowerCase(); }).filter(Boolean));
		noCountryName.forEach((name) => { if (nameReplacersRev.has(name)) { countryName.add(nameReplacersRev.get(name)); } });
		query.push(_qCond(localeTag) + ' PRESENT AND NOT ' + _p(queryJoin([...noCountryName].map((country) => _qCond(localeTag) + ' IS ' + country), 'OR')));
	} else {
		query.push(queryJoin([...countryName].map((country) => _qCond(localeTag) + ' IS ' + country), 'OR'));
	}
	query = queryJoin(query, 'OR');
	return { artists, countries: { iso: countryISO, name: countryName }, query };
}

// Similar culture zone
function getZoneGraphFilter(styleGenre, mode = 'region') {
	if (isArray(styleGenre)) { return [...new Set(styleGenre.filter(Boolean).map((_) => { return getZoneGraphFilter(_, mode); }).flat(Infinity))]; }
	mode = isString(mode) ? mode.toLowerCase() : mode;
	// Retrieve current region
	const regions = music_graph_descriptors_culture.getStyleRegion(styleGenre); // multiple outputs!
	// Set allowed genres from current region
	let styleGenreRegion = new Set();
	if (regions) {
		switch (mode) {
			case 0:
			case 'continent':
			case 1:
			case 'region': break;
			default:
				music_graph_descriptors_culture.getNodes().forEach((sg) => sg && styleGenreRegion.add(sg));
		}
		Object.keys(regions).forEach((key) => {
			switch (mode) {
				case 0:
				case 'continent': {
					music_graph_descriptors_culture.getNodesFromRegion(key).flat(Infinity).forEach((sg) => sg && styleGenreRegion.add(sg));
					break;
				}
				case 1:
				case 'region': {
					regions[key].forEach((subKey) => {
						music_graph_descriptors_culture.getNodesFromRegion(subKey).flat(Infinity).forEach((sg) => sg && styleGenreRegion.add(sg));
					});
					break;
				}
				case 2: // This implies a track with a forbidden genre is still valid as long as it has an allowed genre too
				case 'no-continent': {
					music_graph_descriptors_culture.getNodesFromRegion(key).flat(Infinity).forEach((sg) => styleGenreRegion.delete(sg));
					break;
				}
				case 3:
				case 'no-region': {
					regions[key].forEach((subKey) => {
						music_graph_descriptors_culture.getNodesFromRegion(subKey).flat(Infinity).forEach((sg) => styleGenreRegion.delete(sg));
					});
					break;
				}
			}
		});
	}
	styleGenreRegion.forEach((sg) => styleGenreRegion.add(music_graph_descriptors.getSubstitution(sg))); // Add alternate names
	return [...styleGenreRegion].filter(Boolean);
}

// Utilities
function findStyleGenresMissingGraph({ genreStyleFilter = [], genreStyleTag = ['GENRE'], bAscii = true, bPopup = true } = {}) {
	// Skipped values at pre-filter
	const tagValuesExcluded = new Set(genreStyleFilter); // Filter holes and remove duplicates
	// Get all tags and their frequency
	const tagsToCheck = [...new Set(genreStyleTag.filter(Boolean))]; // Merge and filter
	if (!tagsToCheck.length && bPopup) {
		fb.ShowPopupMessage('There are no tags to check set.', 'Search by distance');
		return null;
	}
	// Get tags
	let tags = new Set(getTagsValuesV4(fb.GetLibraryItems(), tagsToCheck, false, true).flat(Infinity));
	if (bAscii) { tags = new Set([...tags].map((tag) => { return _asciify(tag); })); }
	// Get node list (+ weak substitutions + substitutions + style cluster)
	const nodeList = new Set(music_graph_descriptors.style_supergenre.flat(Infinity)).union(new Set(music_graph_descriptors.style_weak_substitutions.flat(Infinity))).union(new Set(music_graph_descriptors.style_substitutions.flat(Infinity))).union(new Set(music_graph_descriptors.style_cluster.flat(Infinity)));
	// Compare (- user exclusions - graph exclusions)
	const missing = [...tags.difference(nodeList).difference(tagValuesExcluded).difference(music_graph_descriptors.map_distance_exclusions)].sort((a, b) => a.localeCompare(b));
	// Report
	const userFile = folders.userHelpers + 'music_graph_descriptors_xxx_user.js';
	const userFileNotFound = _isFile(userFile) ? '' : ' (not found)';
	const userFileEmpty = !userFileNotFound.length && Object.keys(music_graph_descriptors_user).length ? '' : ' (empty)';
	const report = 'Missing genre/styles may be added to your user\'s descriptors file, either\n' +
		'as new entries or as substitutions where required.\n\n' +
		(missing.length
			? 'In case you find a genre/style which is missing, check is not a misspelling\n' +
			'or alternate term for an existing entry (otherwise tag properly your files\n' +
			'or add the substitution to your file), and then if you think it should be\n' +
			'added to the Graph, let me know at: (but do your work first!)\n' +
			'https://github.com/regorxxx/Music-Graph/issues\n\n' +
			'An example of a good report of missing genre/style would be:\n' +
			'"Hey check this Metal style, you missed from the 90s which is not equal\n' +
			'to \'Black Metal\' or any other present style (+ YouTube link)"\n\n' +
			'An example of a bad report of missing genre/style would be:\n' +
			'"Hey, \'Folk/Rock\' is missing, but it\'s a known genre. Add it please."\n' +
			'(This is not valid because there is already a \'Folk-Rock\' entry, just use\n' +
			'substitutions since that\'s their reason of existence. Also it\'s not\n' +
			'planned to add every possible substitution to the original graph)\n\n' +
			'Graph descriptors:\n'
			: '') +
		'[scripts folder]\\main\\music_graph\\music_graph_descriptors_xxx.js\n' +
		'[profile folder]\\js_data\\helpers\\music_graph_descriptors_xxx_user.js' + (userFileNotFound || userFileEmpty) + '\n\n' +
		(missing.length > 5
			? 'If you don\'t plan to retag your files or add substitutions and there are\n' +
			'too many missing genre/styles, then it\'s recommended to use only\n' +
			'\'WEIGHT\' or \'DYNGENRE\' methods on the scripts.\n\n'
			: '') +
		'List of tags not present on the graph descriptors:\n' +
		missing.joinEvery(', ', 6);
	if (bPopup) { fb.ShowPopupMessage(report, 'Search by distance'); }
	return missing;
}