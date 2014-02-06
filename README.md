# Perforce docset for Dash

> Offline [Perforce Command Reference](http://www.perforce.com/perforce/doc.current/manuals/cmdref/) documentation compatible with [Dash](http://kapeli.com/dash)

## Installation

Just add [p4.xml feed](https://raw.github.com/outcoldman/perforce-docset/master/feeds/p4.xml) to Dash [downloads](http://kapeli.com/guide/guide#downloadingDashDocsets). 

## How to build

> You need this section only if you are interesting in updating current docset or build your own docset generator based on this.

1. Clone this repository.
1. Install [wget](https://www.gnu.org/software/wget/)
  * You can do it with [Homebrew](http://brew.sh/) `brew install wget`
1. Install [node.js](nodejs.org).
1. Install [gulp](http://gulpjs.com/).
1. Download all npm dependencies with `npm install` (invoking from root project folder).
1. Launch `gulp build` command to generate new version