
export function open_indexDB(name, templates) {
    return new Promise((resolve, reject) => {
        const version = (new Date).getTime();
        const request = indexedDB.open(name, version);

        request.onupgradeneeded = function (event) {
            const db = event.target.result;

            // Create 'clusters' and 'original' object stores
            if(!db.objectStoreNames.contains("clusters")) {
                db.createObjectStore("clusters", {autoIncrement: true});
            }

            if(!db.objectStoreNames.contains("original")) {
                db.createObjectStore("original", {autoIncrement: true});
            }

            // Create an object store for each string in 'templates'
            for (let template of templates) {
                if(!db.objectStoreNames.contains(template)) {
                    console.log("Creating object store " + template);
                    db.createObjectStore(template, {autoIncrement: true});
                }
            }

            console.log('DB Upgrade Successful!');
            resolve()
        };

        request.onsuccess = function (event) {
            console.log('DB Open Success! Name:', name);
            event.target.result.close();
            resolve();
        };

        request.onerror = function (event) {
            console.error('DB Open Error: ', event.target.error);
            if(event.target.error.name === "VersionError") {
                indexedDB.deleteDatabase(name);
            }
            reject(event.target.error);
        };
    });
}

export function fetch_from_object_store(db_name, store_name) {
    return new Promise((resolve, reject) => {
        let openRequest = indexedDB.open(db_name);

        openRequest.onsuccess = function(e) {
            const db = e.target.result;
            const tx = db.transaction(store_name, 'readonly');
            let store = tx.objectStore(store_name);
            let getRequest = store.getAll(); // fetch all records from store

            getRequest.onsuccess = function() {
                // Close the db connection after fetching the data
                db.close();
                resolve(getRequest.result); // return array of all data
            };

            getRequest.onerror = function(e) {
                // Close the db connection in case of error
                db.close();
                console.error(`Error fetching data from ${store_name}:` + e.target.error);
                reject(e.target.error);
            };
        };

        openRequest.onerror = function(e) {
            console.error('Error opening database:', e.target.error);
            reject(e.target.error);
        };
    });
}

export function push_to_object_store(db_name, store_name, data) {
    return new Promise((resolve, reject) => {

        var dbRequest = indexedDB.open(db_name);

        dbRequest.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(store_name)) {
                db.createObjectStore(store_name, { autoIncrement: true });
            }
        };

        dbRequest.onerror = function(e) {
            reject(e.target.error);
        };

        dbRequest.onsuccess = function(e) {
            const db = e.target.result;
            const transaction = db.transaction(store_name, 'readwrite');
            const store = transaction.objectStore(store_name);

            store.clear().onsuccess = function() {
                const addPromises = data.map(item => {
                    return new Promise((resolve, reject) => {
                        const addRequest = store.add(item);
                        addRequest.onsuccess = () => resolve();
                        addRequest.onerror = (e) => {
                            db.close();
                            reject(e.target.error);
                        };
                    });
                });

                Promise.all(addPromises)
                    .then(() => {
                        transaction.oncomplete = function() {
                            db.close();
                            resolve('Data replaced successfully.');
                        };
                    })
                    .catch(error => {
                        console.error('Error adding data to object store:', error);
                        reject(error);
                    });

                transaction.onerror = function(e) {
                    db.close();  // Close the DB connection in case of an error
                    reject(e.target.error);
                };
            };

            store.clear().onerror = function(e) {
                db.close();  // Close the DB connection in case of an error
                reject(e.target.error);
            };
        };
    });
}

export function delete_indexDB(name) {
    return new Promise((resolve, reject) => {
        const deleteReq = indexedDB.deleteDatabase(name);

        deleteReq.onerror = function(event) {
            console.error('Error deleting database.');
            reject(event.target.error);
        };

        deleteReq.onsuccess = function(event) {
            console.log('Database deleted successfully');
            resolve();
        };
    });
}

export function clear_object_stores(db_name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(db_name);

        request.onsuccess = function(event) {
            const db = event.target.result;

            if (!db.objectStoreNames.length) {
                console.log('No object stores to clear');
                db.close();
                resolve();
                return;
            }

            const transaction = db.transaction(db.objectStoreNames, 'readwrite');

            let requests = [];

            for (let i = 0; i < db.objectStoreNames.length; i++) {
                const store = transaction.objectStore(db.objectStoreNames[i]);
                requests.push(new Promise((res, rej) => {
                    const request = store.clear();
                    request.onsuccess = res;
                    request.onerror = rej;
                }));
            }

            Promise.all(requests)
                .then(() => {
                    console.log('All object stores cleared');
                    db.close();
                    resolve();
                })
                .catch(e => {
                    console.error('Error clearing object stores: ', e);
                    reject(e);
                });
        };

        request.onerror = function(event) {
            console.error('Error opening database: ', event.target.error);
            reject(event.target.error);
        };
    });
}