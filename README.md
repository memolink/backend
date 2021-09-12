# why?

Google Photos are now limited to 15 GB.  
Memolink tries to recreate experience that the aforementioned app provided.

#### Features:

-   Scrollbar & viewport straight from Google Photos
-   Cloud Vision image tagging
-   KgSearch api to make sense of user's search input
-   Syncthing to sync photos/videos with any of your devices
-   Converter server with ffmpeg and sharp to efficiently store your data

#### Demo:

[Demo](https://user-images.githubusercontent.com/12751644/126324575-b5c0b8c7-3fb4-4066-87f5-b456285f71f2.mp4)

# how?

-   `docker-compose up -d`
-   Set up [converter](https://github.com/memolink/converter)
-   Set up settings using [postman](https://documenter.getpostman.com/view/14162659/TzsWtA3r#c355abfd-7a71-487a-a2cd-e3c7bce5bd42) (make PUT request to http://localhost/api/settings)
-   Connect the other device to syncthing at http://localhost/syncthing with this [guide](https://docs.syncthing.net/intro/getting-started.html#configuring)
-   View and search your gallery at http://localhost
-   Monitor bull queues at http://localhost/queues

### dev

-   `docker-compose -f docker-compose.dev.yml up`
-   (optional) Set up [frontend](https://github.com/memolink/frontend)
