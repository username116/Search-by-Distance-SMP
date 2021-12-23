﻿'use strict'
//02/12/21

include('menu_xxx.js');
include('helpers_xxx.js');
include('helpers_xxx_file.js');

function createButtonsMenu(name) {
	const menu = new _menu();
	menu.clear(true); // Reset on every call
	const files = findRecursivefile('*.js', [folders.xxx + 'buttons']).filter((path) => {return !path.split('\\').pop().startsWith('_');});
	const readmeList = _isFile(folders.xxx + 'helpers\\readme\\buttons_list.json') ? _jsonParseFileCheck(folders.xxx + 'helpers\\readme\\buttons_list.json', 'Readme list', window.Name, convertCharsetToCodepage('UTF-8')) : null;
	// Header
	menu.newEntry({entryText: 'Toolbar configuration:', func: null, flags: MF_GRAYED});
	menu.newEntry({entryText: 'sep'});
	if (!_isFolder(folders.data)) {_createFolder(folders.data);}
	const notAllowedDup = new Set(['buttons_playlist_tools.js', 'buttons_playlist_history.js', 'buttons_playlist_tools_macros.js', 'buttons_tags_automation.js', 'buttons_playlist_tools_pool.js', 'buttons_others_device_priority.js', 'buttons_tags_save_tags.js', 'buttons_tags_automation.js', 'buttons_tags_fingerprint_chromaprint.js', 'buttons_tags_fingerprint_fooid.js', 'buttons_search_fingerprint_chromaprint.js','buttons_search_fingerprint_chromaprint_fast.js', 'buttons_search_fingerprint_fooid.js','buttons_fingerprint_tools.js']);
	const requirePlaylistTools = new Set(['buttons_playlist_tools_macros.js', 'buttons_playlist_tools_macro_custom.js', 'buttons_playlist_tools_pool.js', 'buttons_playlist_tools_submenu_custom.js']);
	const subCategories = ['_fingerprint_', '_search_', '_tags_', '_playlist_', '_others_']; // By order of priority if it matches multiple strings
	const buttonsPathNames = new Set(buttonsPath.map((path) => {return path.split('\\').pop();}));
	function isAllowed(fileName) {return !notAllowedDup.has(fileName) || !buttonsPathNames.has(fileName);}
	function isAllowedV2(fileName) {return !requirePlaylistTools.has(fileName) || buttonsPathNames.has('buttons_playlist_tools.js');}
	{
		const subMenu = menu.newMenu('Add buttons');
		const invId =  nextId('invisible', true, false); // To avoid classes with other submenus
		files.forEach((path, idx) => {
			const fileName = path.split('\\').pop();
			let entryText = path.split('\\').pop() + (isAllowed(fileName) ? (isAllowedV2(fileName) ? '' : '\t(Playlist Tools)') : '\t(1 allowed)');
			let subMenuFolder = subCategories.find((folder) => {return entryText.indexOf(folder) !== -1;});
			if (subMenuFolder && subMenuFolder.length) {
				 subMenuFolder = capitalizeAll(subMenuFolder.replace(/[_]/g,'')) + invId;
				if (!menu.hasMenu(subMenuFolder, subMenu)) {menu.newMenu(subMenuFolder, subMenu);}
			}
			entryText = entryText.replace('buttons_', '');
			menu.newEntry({menuName: subMenuFolder || 'Others', entryText, func: () => {
				buttonsPath.push(path);
				const fileNames = buttonsPath.map((path) => {return path.split('\\').pop();});
				_save(folders.data + name + '.json', JSON.stringify(fileNames, null, 3));
				if (readmeList) {
					const readmeFile = readmeList.hasOwnProperty(fileName) ? readmeList[fileName] : '';
					if (_isFile(folders.xxx + 'helpers\\readme\\' + readmeFile)) {
						fb.ShowPopupMessage(utils.ReadTextFile(folders.xxx + 'helpers\\readme\\' + readmeFile, convertCharsetToCodepage('UTF-8')), readmeFile);
					}
				}
				window.Reload();
			}, flags: isAllowed(fileName) && isAllowedV2(fileName) ? MF_STRING : MF_GRAYED});
		});
	}
	{
		const subMenu = menu.newMenu('Remove buttons');
		buttonsPath.forEach((path, idx) => {
			menu.newEntry({menuName: subMenu, entryText: path.split('\\').pop() + '\t(' + (idx + 1) + ')', func: () => {
				// Remove button
				buttonsPath.splice(idx, 1);
				// Remove properties
				// Since properties have a prefix according to their loading order when there are multiple instances of the same
				// script, removing a button when there a other 'clones' means the other buttons will get their properties names
				// shifted by one. They need to be adjusted or buttons at greater indexes will inherit properties from lower ones!
				const properties = buttonsBar.list[idx];
				if (properties) {deleteProperties(properties);} // Delete current position
				// Retrieves Id
				const keys = properties ? Object.keys(properties) : [];
				if (keys.length) {
					const prefix = properties[Object.keys(properties)[0]][0].split('_')[0];
					const currentId = prefix.slice(0, prefix.length - 1);
					let currentIdNumber = Number(prefix[prefix.length - 1]);
					buttonsBar.list.splice(idx, 1); // Deletes from the list
					// Rewrite other Ids starting at the current number
					buttonsBar.list.forEach((oldProperties, newIdx) => {
						if (newIdx >= idx) {
							const oldKeys = oldProperties ? Object.keys(oldProperties) : [];
							if (oldKeys.length) {
								const oldPrefix = oldProperties[oldKeys[0]][0].split('_')[0];
								const oldId = oldPrefix.slice(0, oldPrefix.length - 1);
								if (oldId === currentId) {
									const backup = getPropertiesPairs(oldProperties, '', 0, false); // First refresh from panel
									deleteProperties(oldProperties); // Delete it at panel
									for (const key in backup) { // Update Id
										if (!backup.hasOwnProperty(key)) {continue;}
										backup[key][0] = backup[key][0].replace(oldPrefix, oldId + currentIdNumber);
									}
									setProperties(backup, '', 0, false, true); // And restore at new position
									currentIdNumber++;
								}
							}
						}
					});
				}
				// Save and reload
				const fileNames = buttonsPath.map((path) => {return path.split('\\').pop();});
				_save(folders.data + name + '.json', JSON.stringify(fileNames, null, 3));
				window.Reload();
			}});
		});
	}
	{
		const subMenu = menu.newMenu('Change buttons position');
		buttonsPath.forEach((path, idx) => {
			menu.newEntry({menuName: subMenu, entryText: path.split('\\').pop() + '\t(' + (idx + 1) + ')', func: () => {
				try {input = Number(utils.InputBox(window.ID, 'Enter new position.\n(1 - ' + buttonsPath.length +')', 'Buttons bar', idx + 1));}
				catch (e) {return;}
				if (isNaN(input) || input > buttonsPath.length) {return;}
				buttonsPath.splice(input - 1, 0, buttonsPath.splice(idx, 1)[0]);
				buttonsBar.list.splice(input - 1, 0, buttonsBar.list.splice(idx, 1)[0]);
				const fileNames = buttonsPath.map((path) => {return path.split('\\').pop();});
				_save(folders.data + name + '.json', JSON.stringify(fileNames, null, 3));
				// Since properties have a prefix according to their loading order when there are multiple instances of the same
				// script, moving a button when there other 'clones' means the other buttons may get their properties names
				// shifted by one. They need to be adjusted or buttons at greater indexes will inherit properties from lower ones!
				const properties = buttonsBar.list[input - 1];
				const keys = properties ? Object.keys(properties) : [];
				if (keys.length) {
					const prefix = properties[Object.keys(properties)[0]][0].split('_')[0];
					const currentId = prefix.slice(0, prefix.length - 1);
					let currentIdNumber = 0;
					// Just rewrite all Ids with same prefix
					console.log(prefix);
					buttonsBar.list.forEach((oldProperties, newIdx) => {
						const oldKeys = oldProperties ? Object.keys(oldProperties) : [];
						if (oldKeys.length) {
							const oldPrefix = oldProperties[oldKeys[0]][0].split('_')[0];
							const oldId = oldPrefix.slice(0, oldPrefix.length - 1);
							if (oldId === currentId) {
								console.log(oldProperties);
								const backup = getPropertiesPairs(oldProperties, '', 0, false); // First refresh from panel
								deleteProperties(oldProperties); // Delete it at panel
								for (const key in backup) { // Update Id
									if (!backup.hasOwnProperty(key)) {continue;}
									backup[key][0] = backup[key][0].replace(oldPrefix, oldId + currentIdNumber);
								}
								setProperties(backup, '', 0, false, true); // And restore at new position
								currentIdNumber++;
							}
						}
					});
				}
				window.Reload();
			}});
		});
	}
	menu.newEntry({entryText: 'sep'});
	menu.newEntry({entryText:'Restore default buttons', func: () => {
		// Restore buttons
		buttonsPath = [...buttonsPathDef];
		// Remove all properties
		buttonsBar.list.forEach((properties) => {deleteProperties(properties);});
		// Save and reload
		const fileNames = buttonsPath.map((path) => {return path.split('\\').pop();});
		_save(folders.data + name + '.json', JSON.stringify(fileNames, null, 3));
		if (readmeList) {
			fileNames.forEach((fileName) => {
				const readmeFile = readmeList.hasOwnProperty(fileName) ? readmeList[fileName] : '';
				if (_isFile(folders.xxx + 'helpers\\readme\\' + readmeFile)) {
					fb.ShowPopupMessage(utils.ReadTextFile(folders.xxx + 'helpers\\readme\\' + readmeFile, convertCharsetToCodepage('UTF-8')), readmeFile);
				}
			});
		}
		window.Reload();
	}});
	menu.newEntry({entryText: 'sep'});
	{
		const menuName = menu.newMenu('Colors...');
		menu.newEntry({menuName, entryText: 'Set custom bar color...', func: () => {
			barProperties.toolbarColor[1] = utils.ColourPicker(window.ID, barProperties.toolbarColor[1]);
			overwriteProperties(barProperties);
			bToolbar = true; // buttons_xxx.js
			toolbarColor = barProperties.toolbarColor[1]; // buttons_xxx.js
			window.Repaint();
		}});
		menu.newEntry({menuName, entryText: 'Set custom text color...', func: () => {
			barProperties.textColor[1] = utils.ColourPicker(window.ID, barProperties.textColor[1]);
			overwriteProperties(barProperties);
			textColor = barProperties.textColor[1]; // buttons_xxx.js
			window.Repaint();
		}});
		menu.newEntry({menuName, entryText: 'sep'});
		menu.newEntry({menuName, entryText: 'Reset...', func: () => {
			barProperties.toolbarColor[1] = -1;
			barProperties.textColor[1] = RGB(0,0,0);
			overwriteProperties(barProperties);
			bToolbar = false; // buttons_xxx.js
			textColor = barProperties.textColor[1]; // buttons_xxx.js
			window.Repaint();
		}});
	}
	menu.newEntry({entryText: 'sep'});
	{
		const subMenu = menu.newMenu('Readmes...');
		const invId =  nextId('invisible', true, false); // To avoid classes with other submenus
		menu.newEntry({menuName: subMenu, entryText: 'Toolbar', func: () => {
			const readmePath = folders.xxx + 'helpers\\readme\\toolbar.txt';
			if ((isCompatible('1.4.0') ? utils.IsFile(readmePath) : utils.FileTest(readmePath, 'e'))) {
				const readme = utils.ReadTextFile(readmePath, convertCharsetToCodepage('UTF-8'));
				if (readme.length) {fb.ShowPopupMessage(readme, 'Toolbar');}
			}
		}});
		if (readmeList) {
			menu.newEntry({menuName: subMenu, entryText: 'sep'});
			Object.keys(readmeList).forEach((fileName) => {
				const readmeFile = readmeList.hasOwnProperty(fileName) ? readmeList[fileName] : '';
				let subMenuFolder = subCategories.find((folder) => {return fileName.indexOf(folder) !== -1;});
				if (subMenuFolder && subMenuFolder.length) {
					 subMenuFolder = capitalizeAll(subMenuFolder.replace(/[_]/g,'')) + invId;
					if (!menu.hasMenu(subMenuFolder, subMenu)) {menu.newMenu(subMenuFolder, subMenu);}
				}
				const entryText = fileName.replace('buttons_', '');
				menu.newEntry({menuName: subMenuFolder || 'Others', entryText, func: () => {
					if (_isFile(folders.xxx + 'helpers\\readme\\' + readmeFile)) {
						fb.ShowPopupMessage(utils.ReadTextFile(folders.xxx + 'helpers\\readme\\' + readmeFile, convertCharsetToCodepage('UTF-8')), readmeFile);
					}
				}});
			});
		}
	}
	menu.newEntry({entryText: 'sep'});
	menu.newEntry({entryText: 'Open buttons folder...', func: () => {
		_explorer(folders.xxx + 'buttons');
	}});
	return menu;
}