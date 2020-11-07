'use strict'

const eslint = require('gulp-eslint')
const gulp = require('gulp')
const less = require('gulp-less')
const log = require('fancy-log')
const sourcemaps = require('gulp-sourcemaps')
const ts = require('gulp-typescript')

gulp.task('eslint', () => {
  log('Linting source code...')
  return gulp
    .src(['src/**/*.ts'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError())
})

gulp.task('typescript', () => {
  log('Transpiling source code...')
  const project = ts.createProject('tsconfig.json')
  return project
    .src()
    .pipe(sourcemaps.init())
    .pipe(project())
    .pipe(
      sourcemaps.write('.', {
        includeContent: false,
        sourceRoot: '../src'
      })
    )
    .pipe(gulp.dest('dist'))
})

gulp.task('less', () => {
  log('Transpiling style sheets...')
  return gulp
    .src('assets/styles/*.less')
    .pipe(less())
    .pipe(gulp.dest('public/styles'))
})

gulp.task('assets', () => {
  log('Copying prebuilt assets to public directory...')
  return gulp.src('assets/**/*.{ico,png,jpg}').pipe(gulp.dest('public'))
})

gulp.task('build', gulp.series('assets', 'less', 'eslint', 'typescript'))

gulp.task('default', gulp.series('build'))
