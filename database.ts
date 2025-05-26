import { NodeData, GeneratedNode } from './types';

/**
 * Opens an IndexedDB database with the specified name and creates object stores for templates
 * @param name - Database name
 * @param templates - Array of template names to create object stores for
 * @returns Promise that resolves when database is ready
 */
export function open_indexDB(name: string, templates: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const version = new Date().getTime();
    const request = indexedDB.open(name, version);

    request.onupgradeneeded = function (event: IDBVersionChangeEvent) {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create 'clusters' and 'original' object stores
      if (!db.objectStoreNames.contains('clusters')) {
        db.createObjectStore('clusters', { autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('original')) {
        db.createObjectStore('original', { autoIncrement: true });
      }

      // Create an object store for each string in 'templates'
      for (const template of templates) {
        if (!db.objectStoreNames.contains(template)) {
          console.log('Creating object store ' + template);
          db.createObjectStore(template, { autoIncrement: true });
        }
      }

      console.log('DB Upgrade Successful!');
      resolve();
    };

    request.onsuccess = function (event: Event) {
      console.log('DB Open Success! Name:', name);
      (event.target as IDBOpenDBRequest).result.close();
      resolve();
    };

    request.onerror = function (event: Event) {
      const error = (event.target as IDBOpenDBRequest).error;
      console.error('DB Open Error: ', error);
      if (error?.name === 'VersionError') {
        indexedDB.deleteDatabase(name);
      }
      reject(error);
    };
  });
}

/**
 * Fetches all data from a specific object store
 * @param db_name - Database name
 * @param store_name - Object store name
 * @returns Promise that resolves with array of stored data
 */
export function fetch_from_object_store(
  db_name: string,
  store_name: string
): Promise<(NodeData | GeneratedNode)[]> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(db_name);

    openRequest.onsuccess = function (e: Event) {
      const db = (e.target as IDBOpenDBRequest).result;
      const tx = db.transaction(store_name, 'readonly');
      const store = tx.objectStore(store_name);
      const getRequest = store.getAll(); // fetch all records from store

      getRequest.onsuccess = function () {
        // Close the db connection after fetching the data
        db.close();
        resolve(getRequest.result); // return array of all data
      };

      getRequest.onerror = function (e: Event) {
        // Close the db connection in case of error
        db.close();
        const error = (e.target as IDBRequest).error;
        console.error(`Error fetching data from ${store_name}:` + error);
        reject(error);
      };
    };

    openRequest.onerror = function (e: Event) {
      const error = (e.target as IDBOpenDBRequest).error;
      console.error('Error opening database:', error);
      reject(error);
    };
  });
}

/**
 * Pushes data to a specific object store, replacing existing data
 * @param db_name - Database name
 * @param store_name - Object store name
 * @param data - Array of data to store
 * @returns Promise that resolves when data is stored
 */
export function push_to_object_store(
  db_name: string,
  store_name: string,
  data: (NodeData | GeneratedNode)[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    const dbRequest = indexedDB.open(db_name);

    dbRequest.onupgradeneeded = function (e: IDBVersionChangeEvent) {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(store_name)) {
        db.createObjectStore(store_name, { autoIncrement: true });
      }
    };

    dbRequest.onerror = function (e: Event) {
      const error = (e.target as IDBOpenDBRequest).error;
      reject(error);
    };

    dbRequest.onsuccess = function (e: Event) {
      const db = (e.target as IDBOpenDBRequest).result;
      const transaction = db.transaction(store_name, 'readwrite');
      const store = transaction.objectStore(store_name);

      store.clear().onsuccess = function () {
        const addPromises = data.map(item => {
          return new Promise<void>((resolve, reject) => {
            const addRequest = store.add(item);
            addRequest.onsuccess = () => resolve();
            addRequest.onerror = (e: Event) => {
              db.close();
              const error = (e.target as IDBRequest).error;
              reject(error);
            };
          });
        });

        Promise.all(addPromises)
          .then(() => {
            transaction.oncomplete = function () {
              db.close();
              resolve('Data replaced successfully.');
            };
          })
          .catch(error => {
            console.error('Error adding data to object store:', error);
            reject(error);
          });

        transaction.onerror = function (e: Event) {
          db.close(); // Close the DB connection in case of an error
          const error = (e.target as IDBRequest).error;
          reject(error);
        };
      };

      store.clear().onerror = function (e: Event) {
        db.close(); // Close the DB connection in case of an error
        const error = (e.target as IDBRequest).error;
        reject(error);
      };
    };
  });
}

/**
 * Deletes an entire IndexedDB database
 * @param name - Database name to delete
 * @returns Promise that resolves when database is deleted
 */
export function delete_indexDB(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const deleteReq = indexedDB.deleteDatabase(name);

    deleteReq.onerror = function (event: Event) {
      console.error('Error deleting database.');
      const error = (event.target as IDBOpenDBRequest).error;
      reject(error);
    };

    deleteReq.onsuccess = function () {
      console.log('Database deleted successfully');
      resolve();
    };
  });
}

/**
 * Clears all object stores in a database
 * @param db_name - Database name
 * @returns Promise that resolves when all stores are cleared
 */
export function clear_object_stores(db_name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(db_name);

    request.onsuccess = function (event: Event) {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.length) {
        console.log('No object stores to clear');
        db.close();
        resolve();
        return;
      }

      const transaction = db.transaction(Array.from(db.objectStoreNames), 'readwrite');

      const requests: Promise<void>[] = [];

      for (let i = 0; i < db.objectStoreNames.length; i++) {
        const store = transaction.objectStore(db.objectStoreNames[i]);
        requests.push(
          new Promise<void>((res, rej) => {
            const request = store.clear();
            request.onsuccess = () => res();
            request.onerror = (e: Event) => {
              const error = (e.target as IDBRequest).error;
              rej(error);
            };
          })
        );
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

    request.onerror = function (event: Event) {
      const error = (event.target as IDBOpenDBRequest).error;
      console.error('Error opening database: ', error);
      reject(error);
    };
  });
}
