var gulp = require('gulp');
var gutil = require('gulp-util');
var clean = require('gulp-clean');
var spawn = require('child_process').spawn;
var fs = require('fs');
var Sequelize = require('sequelize');
var replace = require('gulp-replace');
var _ = require('lodash');
var path = require('path');

var BUILD_PATH = 'build';
var RESOURCES_PATH = path.join(BUILD_PATH, 'p4.docset/Contents/Resources');
var DOCUMENTS_PATH = path.join(RESOURCES_PATH, 'Documents');

var FEEDS_PATH = 'feeds';

// Clean build folder
gulp.task('clean-build', function() {
  return gulp.src(BUILD_PATH + '/**/*', {read: false})
    .pipe(clean());
});

// Copy template
gulp.task('copy-template', ['clean-build'], function() {
  return gulp.src('template/**/*')
    .pipe(gulp.dest(BUILD_PATH));
});

// Download http://www.perforce.com/perforce/doc.current/manuals/cmdref/ docs
gulp.task('wget-download', ['copy-template'], function(cb) {
  var args = [
    '-nH', // No domain in folder names
    '--cut-dirs=4', // Remove /docs/ from folder names
    '-k', // Fix links (to make sure that they will work locally)
    '-p', // --page-requisites (all required files to show this page)
    '-r', // --recursive
    '-np', // --no-parent
    '-E', // Force to add .css, .js extensions
    '-P', DOCUMENTS_PATH, // Download to documents folder
    'http://www.perforce.com/perforce/doc.current/manuals/cmdref/index.html' // What to download
  ]
  spawn( 'wget', args, { stdio: 'inherit' })
    .on('error', function(err) {
      console.log('Error!!!' + err);
    })
    // One page has wrong link to image, so code will be 8 (because of 404)
    .on('exit', function(code) { cb((code === 0 || code === 8) ? null : code); });
});

// Download png image (link is broken in html)
gulp.task('wget-download-image', ['copy-template'], function(cb) {
  var args = [
    '-P', path.join(DOCUMENTS_PATH, 'images'), // Download to documents folder
    'http://www.perforce.com/perforce/doc.current/manuals/cmdref/images/permissions.png' // What to download
  ]
  spawn( 'wget', args, { stdio: 'inherit' })
    .on('error', function(err) {
      console.log('Error!!!' + err);
    })
    .on('exit', function(code) { cb(code === 0 ? null : code); });
});

// Fix images
gulp.task('fix-link-to-image', ['wget-download'], function() {
  return gulp.src([path.join(DOCUMENTS_PATH, 'p4_protect.html')])
    .pipe(
      replace(
        'http://www.perforce.com/perforce/doc.current/manuals/images/permissions.png', 
        'images/permissions.png'
      )
    )
    .pipe(gulp.dest(DOCUMENTS_PATH));
});

// Add ids for all methods
gulp.task('fix-indexes', ['wget-download'], function() {
  return gulp.src([path.join(DOCUMENTS_PATH, '*.html')])
    .pipe(
      replace(
        /<((header)|(noscript)|(nav)|(footer))\b[^>]*>[^]*<\/\1>/ig,
        ''
      )
    )
    .pipe(
      replace(
        /<div class="body"[^>]*>\s*<div class="container"[^>]*>\s*<div id="content"[^>]*>\s*<div class="content-container"[^>]*>([^]+)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*(<script)/igm,
        '<div id="content"><div class="content-container">$1</div></div>$2'
      )
    )
    .pipe(
      replace(
        /(<h1\b[^>]+>)(p4 (\w+))(<\/h1>)/ig,
        '$1<a name="//apple_ref/cpp/Command/$3" class="dashAnchor">$2</a>$4'
      )
    )
    .pipe(
      replace(
        /(<h1\b[^>]+>)([A-Z0-9_, ]+)(<\/h1>)/g,
        '$1<a name="//apple_ref/cpp/Variable/$2" class="dashAnchor">$2</a>$3'
      )
    )
    .pipe(
      replace(
        /(<h2\b[^>]+>)([\w\s]+)(<\/h2>)/ig,
        '$1<a name="//apple_ref/cpp/Section/$2" class="dashAnchor">$2</a>$3'
      )
    )
    .pipe(gulp.dest(DOCUMENTS_PATH));
});

gulp.task('fix-css-styles', ['wget-download'], function() {
  return gulp.src([path.join(DOCUMENTS_PATH, 'css', 'perforce.css')])
    .pipe(
      replace(
        'left: 291px;',
        'left: 0px;'
      )
    )
    .pipe(gulp.dest(path.join(DOCUMENTS_PATH, 'css')));
})

gulp.task('build-index', ['fix-indexes'], function(cb) {

  var indexes = {};

  var regexTitle = /<h1\b[^>]*>(<a\b[^>]*>)?([\w\d\s,\.]*)(<\/a>)?<\/h1>/i;
  var regexContent = /<a name="(\/\/apple_ref\/cpp\/(\w+)\/([\w\s,.]+))" class="dashAnchor">.+<\/a>/igm;
  var match;

  var files = fs.readdirSync(DOCUMENTS_PATH);
  files.forEach(function(file) {
    if (file.indexOf('.html') === (file.length - '.html'.length)) {
      var data = fs.readFileSync(path.join(DOCUMENTS_PATH, file));

      match = regexTitle.exec(data);
      indexes[file] = {
        name: (match && match[2]) ? match[2] : file.substr(0, (file.length - '.html'.length)),
        type: 'File',
        path: file
      }

      while ((match = regexContent.exec(data)) !== null)
      {
        var index = {
          name: match[3].replace(/<[^<>]+>/g, ''),
          type: match[2],
          path: file + '#' + match[1]
        }

        if (indexes[index.name] && indexes[index.name].path !== index.path) {
          var nameIndex = 0;
          var originalName = index.name;
          do {
            index.name = originalName + ' (' + (++nameIndex) + ')';
          } while(indexes[index.name] && indexes[index.name].path !== index.path);
        }

        if (index.type !== 'Section' && !indexes[index.name]) {
          indexes[index.name] = index;
        }

        fs.appendFileSync(path.join(BUILD_PATH, 'index.log'), JSON.stringify(index) + '\n');
      }
    }
  })

  var seq = new Sequelize('database', 'username', 'password', {
    dialect: 'sqlite',
    storage: path.join(RESOURCES_PATH, 'docSet.dsidx')
  });

  // Copy to DB
  var SearchIndex = seq.define('searchIndex', {
    id: { type: Sequelize.INTEGER, autoIncrement: true },
    name: { type: Sequelize.STRING },
    type: { type: Sequelize.STRING },
    path: { type: Sequelize.STRING }
  }, {
    freezeTableName: true,
    timestamps: false
  });

  SearchIndex.sync().success(function() {
    SearchIndex.bulkCreate(_.values(indexes))
      .success(function() {
        cb();
      })
      .error(cb);
  });
});

gulp.task('create-feed', ['build-index'], function(cb) {
  if (fs.existsSync(path.join(FEEDS_PATH, 'p4.tgz'))) {
    fs.unlinkSync(path.join(FEEDS_PATH, 'p4.tgz'));
  }

  var args = [
    '--exclude=".DS_Store"', 
    '-cvzf', path.join(FEEDS_PATH, 'p4.tgz'),
    path.join(BUILD_PATH, 'p4.docset')
  ]
  spawn( 'tar', args, { stdio: 'inherit' })
    .on('error', cb)
    .on('exit', function(code) { cb(code === 0 ? null : code); });
});

gulp.task('update-feed-version', ['wget-download'], function() {
  var data = fs.readFileSync(path.join(DOCUMENTS_PATH, 'index.html'));
  var versionMatch = /<title>Perforce ([\d\.]+)[^<]+<\/title>/i.exec(data);

  return gulp.src([path.join(FEEDS_PATH, 'p4.xml')])
    .pipe(
      replace(
        /<version>([\d\.]+)<\/version>/ig, 
        '<version>' + versionMatch[1] + '</version>'
      )
    )
    .pipe(gulp.dest(FEEDS_PATH));
});

gulp.task(
  'build', 
  [
    'clean-build',
    'copy-template',
    'wget-download',
    'wget-download-image',
    'fix-link-to-image',
    'fix-indexes',
    'fix-css-styles',
    'build-index',
    'create-feed',
    'update-feed-version'
  ]
);