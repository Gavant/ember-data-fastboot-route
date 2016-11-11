import Ember from 'ember';

const {
    computed,
    get,
    set,
    setProperties,
    String: { dasherize },
    isArray,
    $,
    keys: emberKeys
} = Ember;

const keys = Object.keys || emberKeys;

export function initialize(applicationInstance) {
    let fastboot = applicationInstance.lookup('service:fastboot');
    let shoeboxSerializer = applicationInstance.lookup('serializer:shoebox');
    let store = applicationInstance.lookup('service:store');
    if (shoeboxSerializer) {
        set(shoeboxSerializer, 'store', store);
    }

    Ember.Route.reopen({
        fastboot: fastboot,

        /**
            Tells the route if the data for this specific route has been loaded from the shoebox already.
            @property dataLoadedFromShoebox
            @type Boolean
            @default false
            @public
        */
        dataLoadedFromShoebox: false,

        /**
            This property becomes the shoebox store name when serialized.
            @property routeNameDasherized
            @type String
            @default Dasherized current route name
            @public
        */
        routeNameDasherized: computed('routeName', function() {
            let routeName = get(this, 'routeName').replace(/\.+/g," ");
            return dasherize(routeName);
        }),

        /**
            Retrieves the shoebox store for a given name and returns null if sheobox or shoebox store does not exist.
            @method getShoeboxStore
            @param {String} name The name of the shoebox store
            @return {Object} The shoebox store
            @public
        */
        getShoeboxStore (name) {
            let shoebox = get(fastboot, 'shoebox');
            return shoebox ? shoebox.retrieve(name) : null;
        },

        /**
            Decides whether or not the data for the route should be loaded from the shoebox. It breaks down as follows:
            1) If we are in fastboot, we should NOT return shoebox data.
            2) If we do not have a shoebox store for this route, we should NOT return shoebox data
            3) Otherwise return the shoebox data
            @property shouldLoadFromShoebox
            @type Boolean
            @public
        */
        shouldLoadFromShoebox: computed('fastboot.isFastBoot', 'fastboot.shoebox', 'dataLoadedFromShoebox', function() {
            if (get(this, 'fastboot.isFastBoot')) {
                    return false;
            } else {
                let routeName = get(this, 'routeNameDasherized');
                let shoeboxStore = this.getShoeboxStore(routeName);
                if (!shoeboxStore) {
                    return false;
                }
                return true;
            }
        }),

        /**
            Serializes the shoebox data for a particular model
            @method serializeShoeboxData
            @param {DS.Model} model The model data of the route
            @return {Object} The serialized model data
            @public
        */
        serializeShoeboxData (model) {
            if(isArray(model)) {
                return model.reduce((a,b) => a.concat(b), [])
                    .map(record => record._createSnapshot())
                    .map(snapshot => shoeboxSerializer.serialize(snapshot, { includeId: true }))
                    .reduce((a,b) => { a.data.push(b.data); return a; }, { data: [] });
            } else {
                return shoeboxSerializer.serialize(model._createSnapshot(), { includeId: true });
            }
        },

        /**
            Unescapes the html
            @method unescapeHtml
            @param {String} safe A JSON string representing the shoebox store
            @return {String}
            @public
        */
        unescapeHtml(safe) {
            return $('<div />').html(safe).text();
        },

        /**
            Parses the shoebox store information for the route and returns the records that were pushed into the ember data store
            @method getShoeboxModelForRoute
            @return {DS.Model|Array} The record(s) that were pushed into the DS store
            @public
        */
        getShoeboxModelForRoute() {
            let shoebox = get(fastboot, 'shoebox');
            let routeName = get(this, 'routeNameDasherized');
            let records = null;
            let isSingleRecord = false;
            let shoeboxStore = this.getShoeboxStore(routeName);

            if (!shoeboxStore) {
                return;
            }

            //There should only be one key in the object
            keys(shoeboxStore).forEach((key) => {
                set(this, 'modelName', key);
                //We need to unescape the html until https://github.com/ember-fastboot/fastboot/pull/79
                let value = this.unescapeHtml(JSON.stringify(shoeboxStore[key]));
                let deserializedData = JSON.parse(value);
                isSingleRecord = !isArray(deserializedData.data);

                if(isSingleRecord) {
                    deserializedData.data = Ember.A([deserializedData.data]);
                }

                records = store.push(deserializedData);
            });

            set(shoebox, routeName, null);
            let shoeboxStoreNode = document.querySelector(`#shoebox-${routeName}`);
            shoeboxStoreNode.parentElement.removeChild(shoeboxStoreNode);

            return isSingleRecord ? records.get('firstObject') : records;
        },

        /**
            The method thats get called inplace of the user defined model
            @method shoeboxModel
            @return {DS.Model|Array} The record(s) that were in the shoebox store
            @public
        */
        shoeboxModel() {
            return this.getShoeboxModelForRoute();
        },

        /**
            Checks to see if we should load the shoebox data.

            If we should it saves the routes user defined model method as originalModel and marks dataLoadedFromShoebox as true.
            It then sets the shoebox model as the routes current model.

            If we should not load from shoebox & an orignalModel exists we want to set originalModel back to the model so the application will function correctly on next load of route.

            NOTE: You must call this._super on any beforeModel you define in order for this to run

            @method beforeModel
            @public
        */
        beforeModel() {
            if (get(this, 'shouldLoadFromShoebox')) {
                setProperties(this, {
                    originalModel: get(this, 'model'),
                    dataLoadedFromShoebox: true
                });
                set(this, 'model', this.shoeboxModel);
            } else if (get(this, 'originalModel')) {
                set(this, 'model', this.originalModel);
            }
        },

        /**
            Checks to see if we are in fastboot, and if the route has model.
            If thats the case we want to serialize the model and add it to the shoebox

            NOTE: You must call this._super on any afterModel you define in order for this to run

            @method afterModel
            @param {DS.Model} model
            @public
        */
        afterModel(model) {
            let routeName = get(this, 'routeNameDasherized');
            let shoebox = get(fastboot, 'shoebox');
            let shoeboxStore = this.getShoeboxStore(routeName);
            //If this is in fastboot, put this routes model into a specific shoebox store so we can transfer exactly what was in the model to the correct route
            if (get(fastboot, 'isFastBoot') && model) {
                if (!shoeboxStore) {
                    shoeboxStore = {};
                    shoebox.put(routeName, shoeboxStore);
                }
                shoeboxStore[get(this, 'modelName')] = this.serializeShoeboxData(model);
            }
        },
    });
}

export default {
  name: 'fastboot-data-route',
  initialize: initialize
};
