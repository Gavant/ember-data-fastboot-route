# ember-data-fastboot-route

ember-data-fastboot-route is a library for handling the serialization and use of the Fastboot Shoebox data.
This library serializes each route model into a seperate shoebox to maintain route state. It then decides whether or not to return shoebox data instead of running your normal model method.

This fixes any loading route issues you might have using fastboot, and also allows you to use ember data's store.query (which bypasses any data in the store) and still return the correct data when the web app boots up and re-renders.

This addon requires use of ember data.

For more information about FastBoot, see
[www.ember-fastboot.com][ember-fastboot], the Ember CLI addon that's a
prerequisite for developing FastBoot apps.

[ember-fastboot]: https://www.ember-fastboot.com

## Installation

Installing the library is as easy as:

```bash
ember install ember-data-fastboot-route
```

## Usage

```js
import Ember from 'ember';

export default Route.extend({
    modelName: 'user',
    beforeModel() {
        this._super(...arguments);
        ...othercode
    },
    model() {
        const query = {
            enabled: true
            firstName: 'Tom'
        };

        return this.store.query('user', query);
    },
    afterModel() {
        this._super(...arguments);
        ...othercode
    }
});

```

There are 3 things you need to keep in mind.
1) A modelName property is required, as that is needed to serialize the data to the correct model type.
2) Any beforeModel defined by your app must call the super method (but if no beforeModel exists for the route, you don't need to add one for this addon to work)
3) Any afterModel defined by your app must call the super method (but if no afterModel exists for the route, you don't need to add one for this addon to work)
