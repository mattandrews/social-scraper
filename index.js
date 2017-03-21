var Twitter = require('twit');
var Q = require('q');
var fs = require('fs');
var moment = require('moment');
var request = require('request');
var argv = require('yargs').argv;
var _ = require('lodash');

// configuration
var daysToLookBack = 30;
var twitterUsername = 'bbcthree';
var facebookPageId = 7519460786;

// make the twitter client
var twitterClient = new Twitter({
    consumer_key: 'KEY',
    consumer_secret: 'SECRET',
    access_token: 'TOKEN',
    access_token_secret: 'SECRET'
});

// auth facebook
var facebookAuth = {
    appId: 'APP_ID',
    appSecret: 'APP_SECRET'
};

var dateToStopAt = moment().subtract(daysToLookBack, 'days');

var tmpData = {
    twitter: [],
    facebook: []
};

// output data for JSON
var writeDataToFile = function (data, filename) {
    fs.writeFile('./data-' +  filename + '.json', JSON.stringify(data), function (err) {
        if (err) { return console.log(err); }
    });
};

// i h8 u twitter
var parseRidiculousTwitterDate = function (ridiculousDate) {
    var twitterDateFormat = 'dd MMM DD HH:mm:ss ZZ YYYY';
    return moment(ridiculousDate, twitterDateFormat, 'en');
};

// call API for tweets
var fetchTweets = function (id) {
    var params = {
        screen_name: twitterUsername,
        count: 20,
        trim_user: true,
        include_rts: false
    };

    if (id) {
        params.max_id = id;
        console.log('fetching MORE twitter data...');
    } else {
        console.log('fetching twitter data...');
    }

    twitterClient.get('statuses/user_timeline', params).catch(function (err) {
        console.log(err);
        return err;
    }).then(function (response) {
        handleTwitterResponse(response);
    });
};

// parse and get the next page if needed
var handleTwitterResponse = function (response) {
    var d = response.data;
    var finalTweet = d[d.length - 1];
    var lastTweetDate = parseRidiculousTwitterDate(finalTweet.created_at);
    var lastTweetID = finalTweet.id;
    tmpData.twitter.push.apply(tmpData.twitter, d); // add to the array

    var loadedEnoughTweets = lastTweetDate.isBefore(dateToStopAt);
    if (!loadedEnoughTweets) {
        fetchTweets(lastTweetID);
    } else {
        writeDataToFile(tmpData.twitter, 'twitter');
        tmpData.twitter = [];
        console.log('received all Twitter data!');
        // now fetch facebook!
        fetchFacebookPosts()
    }
};

var fetchFacebookPosts = function (customUrl) {
    var bbcOnePageId = facebookPageId;
    var appId = facebookAuth.appId;
    var appSecret = facebookAuth.appSecret;
    var authString = '&access_token=' + appId + '|' + appSecret;
    var urlBase = 'https://graph.facebook.com/';
    var fields = 'likes.summary(true),name,shares,created_time,comments.summary(true),link,reactions.summary(true)';
    var endpoint = '/posts?';
    var url = urlBase + bbcOnePageId + endpoint + 'fields=' + fields + authString;
    if (customUrl) {
        console.log('fetching MORE facebook data...');
        url = customUrl;
    } else {
        console.log('fetching facebook data...');
    }

    request(url, function (error, response, body) {
        handleFacebookResponse(JSON.parse(body));
    });
};

var handleFacebookResponse = function (response) {
    var d = response.data;
    if (d) {
        var lastPost = d[d.length - 1];
        if (lastPost) {
            var lastPostDate = moment(lastPost.created_time);
            tmpData.facebook.push.apply(tmpData.facebook, d); // add to the array
            var loadedEnough = lastPostDate.isBefore(dateToStopAt);
            if (!loadedEnough) {
                fetchFacebookPosts(response.paging.next);
            } else {
                console.log('received all FB data!');
                writeDataToFile(tmpData.facebook, 'facebook');
                tmpData.facebook = [];
                // we're done
                console.log('### all finished ###');
            }
        }
    }
};


var analyseData = function () {
    var fb = require('./data-facebook.json');
    var tw = require('./data-twitter.json');

    // fb checks

    var getAverageMinMaxFacebook = function (fieldToCheckFor, subField, subSubField) {
        var cleanData = fb.filter(d => d[fieldToCheckFor]);

        var filterFunc = function (d) {
            var megaField = d[fieldToCheckFor][subField];
            if (subSubField) { megaField = megaField[subSubField]; }
            return megaField;
        };

        return {
            average: _.meanBy(cleanData, filterFunc),
            min: _.minBy(cleanData, filterFunc),
            max: _.maxBy(cleanData, filterFunc)
        };
    };

    // twitter checks

    var getAverageMinMaxTwitter = function (field) {
        return {
            average: _.meanBy(tw, d => d[field]),
            min: _.minBy(tw, d => d[field]),
            max: _.maxBy(tw, d => d[field]),
        }
    };

    var buildTwitterUrl = function (id) {
        return 'https://twitter.com/' + twitterUsername + '/statuses/' + id;
    };

    var twitterAnalysis = {
        retweets: getAverageMinMaxTwitter('retweet_count'),
        faves: getAverageMinMaxTwitter('favorite_count')
    };

    var twitterData = {
        retweets: {
            average: Math.round(twitterAnalysis.retweets.average),
            min: twitterAnalysis.retweets.min.retweet_count,
            max: twitterAnalysis.retweets.max.retweet_count,
            most: buildTwitterUrl(twitterAnalysis.retweets.max.id_str),
            least: buildTwitterUrl(twitterAnalysis.retweets.min.id_str)
        },
        favourites: {
            average: Math.round(twitterAnalysis.faves.average),
            min: twitterAnalysis.faves.min.retweet_count,
            max: twitterAnalysis.faves.max.retweet_count,
            most: buildTwitterUrl(twitterAnalysis.faves.max.id_str),
            least: buildTwitterUrl(twitterAnalysis.faves.min.id_str)
        }
    };

    var facebookAnalysis = {
        shares: getAverageMinMaxFacebook('shares', 'count'),
        likes: getAverageMinMaxFacebook('likes', 'summary', 'total_count'),
        comments: getAverageMinMaxFacebook('comments', 'summary', 'total_count'),
        reactions: getAverageMinMaxFacebook('reactions', 'summary', 'total_count')
    };

    var facebookData = {
        shares: {
            average: Math.round(facebookAnalysis.shares.average),
            min: facebookAnalysis.shares.min.shares.count,
            max: facebookAnalysis.shares.max.shares.count,
            most: facebookAnalysis.shares.max.link,
            least: facebookAnalysis.shares.min.link
        },
        likes: {
            average: Math.round(facebookAnalysis.likes.average),
            min: facebookAnalysis.likes.min.likes.summary.total_count,
            max: facebookAnalysis.likes.max.likes.summary.total_count,
            most: facebookAnalysis.likes.max.link,
            least: facebookAnalysis.likes.min.link
        },
        reactions: {
            average: Math.round(facebookAnalysis.reactions.average),
            min: facebookAnalysis.reactions.min.reactions.summary.total_count,
            max: facebookAnalysis.reactions.max.reactions.summary.total_count,
            most: facebookAnalysis.reactions.max.link,
            least: facebookAnalysis.reactions.min.link
        },
        comments: {
            average: Math.round(facebookAnalysis.comments.average),
            min: facebookAnalysis.comments.min.comments.summary.total_count,
            max: facebookAnalysis.comments.max.comments.summary.total_count,
            most: facebookAnalysis.comments.max.link,
            least: facebookAnalysis.comments.min.link
        }
    };

    console.log({
        twitter: twitterData,
        facebook: facebookData
    });

};

if (argv.fetch) {
    // kick it off
    fetchTweets();
} else if (argv.analyse) {
    analyseData();
} else {
    console.error('error: use --fetch or --analyse to do stuff');
}
