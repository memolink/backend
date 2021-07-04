const { default: axios } = require('axios')
const path = require('path')
const key = '***REMOVED***'
const models = require('../../../models')
async function getEntities(query, limit = 500) {
	const res = await axios.get('https://kgsearch.googleapis.com/v1/entities:search', {
		params: {
			query,
			key,
			limit,
			languages: 'ru',
		},
	})
	console.log(res.data)

	return res.data.itemListElement.map(({ resultScore: score, result: { '@id': mid, detailedDescription, description } }) => ({
		score,
		mid: mid.replace('kg:', ''),
		description,
		detailedDescription,
	}))
}

async function getPhotos({ searchTerm, limit, minimalScore = 50, sort = 'score', fromDate, toDate, sections }) {
	if (fromDate) {
		fromDate = new Date(parseInt(fromDate))
	} else {
		fromDate = new Date()
	}

	if (toDate) {
		toDate = new Date(parseInt(toDate))
	} else {
		toDate = new Date()
		toDate.setDate(toDate.getDate() - 30)
	}

	console.log({
		date: {
			$gt: toDate,
			$lte: fromDate,
		},
	})
	// entities[1].mid = '/j/3gbwgn'
	// entities[3].mid = '/m/02wbm'
	//console.log(entities)
	const pipeline = [
		{
			$match: {
				date: {
					$gt: new Date(toDate),
					$lte: new Date(fromDate),
				},
			},
		},
	]
	if (searchTerm) {
		const entities = await getEntities(searchTerm, limit)

		pipeline.push({ $unwind: '$tags' })
		pipeline.push({ $match: { 'tags.mid': { $in: entities.map(({ mid }) => mid) } } })

		pipeline.push({
			$addFields: {
				entity: {
					$let: {
						vars: {
							entities,
						},
						in: {
							$first: {
								$filter: {
									input: '$$entities',
									as: 'entity',
									cond: { $eq: ['$$entity.mid', '$tags.mid'] },
								},
							},
						},
					},
				},
			},
		})

		pipeline.push({
			$addFields: {
				score: { $multiply: ['$tags.score', '$entity.score'] },
			},
		})

		pipeline.push({
			$group: {
				_id: '$_id',
				date: { $first: '$date' },
				width: { $first: '$width' },
				height: { $first: '$height' },
				video: { $first: '$video' },
				score: { $sum: '$score' },
				tags: { $addToSet: '$tags' },
				entities: { $addToSet: '$entity' },
			},
		})

		pipeline.push({
			$match: {
				score: { $gte: parseInt(minimalScore) },
			},
		})
	} else {
		pipeline.push({
			$project: {
				_id: 1,
				date: 1,
				width: 1,
				height: 1,
				video: 1,
			},
		})
	}
	if (sections) {
		pipeline.push({
			$group: {
				_id: { $dateToString: { format: '%Y-%m', date: '$date' } },
				count: { $sum: 1 },
			},
		})
		pipeline.push({ $sort: { _id: -1 } })
	} else {
		pipeline.push({
			$addFields: {
				day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
			},
		})
		pipeline.push({ $sort: { date: -1 } })
		pipeline.push({
			$group: {
				_id: '$day',
				images: { $push: '$$ROOT' },
			},
		})
		pipeline.push({ $sort: { _id: -1 } })
	}
	console.log(pipeline)
	const photos = await models.Photo.aggregate(pipeline)

	return photos
}

async function getPhoto({ _id, type }) {
	const photo = await models.Photo.findOne({ _id }, [type])
	return photo[type] && path.resolve(photo[type])
}

async function getMetadata() {
	const [{ phones, tags }] = await models.Photo.aggregate([
		{
			$unwind: '$tags',
		},
		{
			$group: {
				_id: null,
				phones: { $addToSet: { maker: '$metadata.Make', model: '$metadata.Model' } },
				tags: { $addToSet: { mid: '$tags.mid', description: '$tags.description' } },
			},
		},
	])

	return {
		phones: phones.filter(phone => Object.keys(phone).length),
		tags,
	}
}

module.exports = { getPhotos, getPhoto, getMetadata }
