const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const recipeController = require('../controllers');

// API: Lấy danh sách công thức
router.get('/select-recipes', recipeController.getRecipes);

router.get('/test', recipeController.Test);

// API: Xóa công thức
router.delete('/delete-recipe/:id', recipeController.deleteRecipe);

// API: Thêm công thức mới
router.post('/add-recipes', upload.single('image'), recipeController.addRecipe);

module.exports = router;
